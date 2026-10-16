import type {
    Server as HttpServer,
} from "node:http";

import {
    Server,
    type Socket,
} from "socket.io";

import {
    eq,
} from "drizzle-orm";

import { corsOptions } from "../config/cors.ts";
import { env } from "../config/env.ts";

import {
    getUserFromSession,
} from "../modules/auth/auth.service.ts";

import { db } from "../database/index.ts";

import {
    conversationParticipants,
} from "../database/schema/index.ts";

import {
    registerPresence,
    unregisterPresence,
    getPresenceStatuses,
} from "./realtime-helpers/presence.helper.ts";

import {
    joinConversationRoom,
    leaveConversationRoom,
} from "./realtime-helpers/conversation-room.helper.ts";

import {
    startTyping,
    handleTypingStop,
    clearSocketTypingSessions,
    clearUserTypingSessions,
} from "./realtime-helpers/typing.helper.ts";

import {
    isSocketEventAllowed,
    clearSocketRateLimits,
    cleanupRateLimitRecords,
} from "./realtime-helpers/rate-limit.helper.ts";
import { canAccessConversation } from "../modules/messaging-module/messaging-helpers/conversation-access.helper.ts";

let io: Server | null = null;

let rateLimitCleanupTimer:
    ReturnType<typeof setInterval> | null = null;

interface SocketAcknowledgement {
    success: boolean;
    message?: string;
}

type SocketAcknowledgementCallback = (
    result: SocketAcknowledgement,
) => void;

function getCookieValue(
    cookieHeader: string | undefined,
    name: string,
): string | null {
    if (!cookieHeader) {
        return null;
    }

    const cookies = cookieHeader
        .split(";")
        .map((part) => part.trim());

    for (const cookie of cookies) {
        const separator = cookie.indexOf("=");

        if (separator === -1) {
            continue;
        }

        const key = cookie.slice(0, separator);
        const value = cookie.slice(separator + 1);

        if (key !== name) {
            continue;
        }

        try {
            return decodeURIComponent(value);
        } catch {
            return null;
        }
    }

    return null;
}

async function authenticateSocket(
    socket: Socket,
    next: (error?: Error) => void,
): Promise<void> {
    try {
        const token = getCookieValue(
            socket.handshake.headers.cookie,
            env.SESSION_COOKIE_NAME,
        );

        if (!token) {
            next(new Error("Authentication required."));
            return;
        }

        const user = await getUserFromSession(token);

        if (!user) {
            next(new Error("Invalid or expired session."));
            return;
        }

        socket.data.userId = user.id;

        next();
    } catch {
        next(new Error("Socket authentication failed."));
    }
}

function isValidConversationId(
    value: unknown,
): value is string {
    return (
        typeof value === "string" &&
        value.trim().length > 0 &&
        value.length <= 100
    );
}

function acknowledge(
    callback: unknown,
    result: SocketAcknowledgement,
): void {
    if (typeof callback !== "function") {
        return;
    }

    try {
        (
            callback as SocketAcknowledgementCallback
        )(result);
    } catch {
        // Client acknowledgement errors must not crash the server.
    }
}

/**
 * Reject events when a socket exceeds its configured rate limit.
 */
function enforceEventRateLimit(
    socket: Socket,
    eventName: string,
    callback: unknown,
): boolean {
    const allowed = isSocketEventAllowed(
        socket.id,
        eventName,
    );

    if (allowed) {
        return true;
    }

    acknowledge(callback, {
        success: false,
        message:
            "Too many requests. Please wait and try again.",
    });

    return false;
}

/**
 * Notify other conversation-room members when a user goes online
 * or offline.
 *
 * The disconnecting event fires before the socket leaves its rooms.
 */
function broadcastPresenceToRooms(
    socket: Socket,
    event: "presence:online" | "presence:offline",
    userId: string,
): void {
    for (const room of socket.rooms) {
        if (!room.startsWith("conversation:")) {
            continue;
        }

        socket.to(room).emit(event, {
            userId,
        });
    }
}

/**
 * Initializes the authenticated Socket.IO server.
 *
 * Calling this function more than once returns the existing instance.
 */
export function initializeSocket(
    httpServer: HttpServer,
): Server {
    if (io) {
        return io;
    }

    const socketServer = new Server(
        httpServer,
        {
            cors: corsOptions,
        },
    );

    io = socketServer;

    socketServer.use(authenticateSocket);

    if (!rateLimitCleanupTimer) {
        rateLimitCleanupTimer = setInterval(
            () => {
                cleanupRateLimitRecords();
            },
            60_000,
        );

        rateLimitCleanupTimer.unref();
    }

    socketServer.on("connection", (socket) => {
        const userId: unknown = socket.data.userId;

        if (
            typeof userId !== "string" ||
            userId.trim().length === 0
        ) {
            socket.disconnect(true);
            return;
        }

        /*
         * Register this socket as one active connection
         * belonging to the authenticated user.
         */
        registerPresence(socket, userId);

        /*
         * Private room for user-targeted notifications.
         */
        void socket.join(`user:${userId}`);

        /*
         * Join an authorized conversation.
         */
        socket.on(
            "conversation:join",
            async (
                conversationId: unknown,
                callback?: SocketAcknowledgementCallback,
            ) => {
                if (
                    !enforceEventRateLimit(
                        socket,
                        "conversation:join",
                        callback,
                    )
                ) {
                    return;
                }

                if (!isValidConversationId(conversationId)) {
                    acknowledge(callback, {
                        success: false,
                        message: "Invalid conversation ID.",
                    });

                    return;
                }

                const roomName = `conversation:${conversationId}`;

                const wasAlreadyInRoom =
                    socket.rooms.has(roomName);

                try {
                    /*
                    * Always check the current database authorization
                    * before allowing the socket to join.
                    */
                    const authorizedBeforeJoin =
                        await canAccessConversation(
                            conversationId,
                            userId,
                        );

                    if (!authorizedBeforeJoin) {
                        if (wasAlreadyInRoom) {
                            await socket.leave(roomName);
                        }

                        acknowledge(callback, {
                            success: false,
                            message:
                                "You do not have access to this conversation.",
                        });

                        return;
                    }

                    /*
                    * Join the room only after authorization succeeds.
                    */
                    const result = await joinConversationRoom(
                        socket,
                        conversationId,
                    );

                    if (!result.success) {
                        acknowledge(callback, result);
                        return;
                    }

                    /*
                    * Recheck authorization before exposing participant
                    * presence information.
                    */
                    const authorizedAfterJoin =
                        await canAccessConversation(
                            conversationId,
                            userId,
                        );

                    if (!authorizedAfterJoin) {
                        await socket.leave(roomName);

                        acknowledge(callback, {
                            success: false,
                            message:
                                "You can no longer access this conversation.",
                        });

                        return;
                    }

                    /*
                    * Fetch participant IDs only after authorization.
                    */
                    const participants = await db
                        .select({
                            userId: conversationParticipants.userId,
                        })
                        .from(conversationParticipants)
                        .where(
                            eq(
                                conversationParticipants.conversationId,
                                conversationId,
                            ),
                        );

                    /*
                    * Recheck authorization before sending the snapshot.
                    */
                    const authorizedBeforeSnapshot =
                        await canAccessConversation(
                            conversationId,
                            userId,
                        );

                    if (!authorizedBeforeSnapshot) {
                        await socket.leave(roomName);

                        acknowledge(callback, {
                            success: false,
                            message:
                                "You can no longer access this conversation.",
                        });

                        return;
                    }

                    socket.emit("presence:snapshot", {
                        conversationId,
                        users: getPresenceStatuses(
                            participants.map(
                                (participant) => participant.userId,
                            ),
                        ),
                    });

                    /*
                    * Broadcast online only when this is a new room
                    * membership and the user has no other socket there.
                    */
                    if (!wasAlreadyInRoom) {
                        const roomSockets =
                            await socketServer
                                .in(roomName)
                                .fetchSockets();

                        const anotherSocketForUser =
                            roomSockets.some(
                                (roomSocket) =>
                                    roomSocket.id !== socket.id &&
                                    roomSocket.data.userId === userId,
                            );

                        if (!anotherSocketForUser) {
                            socket.to(roomName).emit(
                                "presence:online",
                                { userId },
                            );
                        }
                    }

                    acknowledge(callback, {
                        success: true,
                    });
                } catch (error) {
                    /*
                    * Remove newly joined sockets if an operation fails.
                    */
                    if (!wasAlreadyInRoom) {
                        try {
                            await socket.leave(roomName);
                        } catch (leaveError) {
                            console.error(
                                "Conversation room rollback failed:",
                                leaveError,
                            );
                        }
                    }

                    console.error(
                        "Conversation join failed:",
                        error,
                    );

                    acknowledge(callback, {
                        success: false,
                        message: "Unable to join conversation.",
                    });
                }
            },
        );

        /*
         * Leave a conversation.
         */
        socket.on(
            "conversation:leave",
            async (
                conversationId: unknown,
                callback?: SocketAcknowledgementCallback,
            ) => {
                if (
                    !enforceEventRateLimit(
                        socket,
                        "conversation:leave",
                        callback,
                    )
                ) {
                    return;
                }

                try {
                    if (!isValidConversationId(conversationId)) {
                        acknowledge(callback, {
                            success: false,
                            message: "Invalid conversation ID.",
                        });

                        return;
                    }

                    /*
                     * Stop this socket's typing session before
                     * leaving the conversation room.
                     *
                     * This also clears the caller's typing session
                     * if their conversation access has been revoked.
                     */
                    await handleTypingStop(
                        socketServer,
                        socket,
                        conversationId,
                    );

                    const result = await leaveConversationRoom(
                        socket,
                        conversationId,
                    );

                    acknowledge(callback, result);
                } catch (error) {
                    console.error(
                        "Conversation leave failed:",
                        error,
                    );

                    acknowledge(callback, {
                        success: false,
                        message: "Unable to leave conversation.",
                    });
                }
            },
        );

        /*
         * Start typing.
         */
        socket.on(
            "typing:start",
            async (
                conversationId: unknown,
                callback?: SocketAcknowledgementCallback,
            ) => {
                if (
                    !enforceEventRateLimit(
                        socket,
                        "typing:start",
                        callback,
                    )
                ) {
                    return;
                }

                try {
                    const result = await startTyping(
                        socketServer,
                        socket,
                        conversationId,
                    );

                    acknowledge(callback, result);
                } catch (error) {
                    console.error(
                        "Typing start failed:",
                        error,
                    );

                    acknowledge(callback, {
                        success: false,
                        message:
                            "Unable to update typing status.",
                    });
                }
            },
        );

        /*
         * Stop typing.
         */
        socket.on(
            "typing:stop",
            async (
                conversationId: unknown,
                callback?: SocketAcknowledgementCallback,
            ) => {
                if (
                    !enforceEventRateLimit(
                        socket,
                        "typing:stop",
                        callback,
                    )
                ) {
                    return;
                }

                try {
                    const result = await handleTypingStop(
                        socketServer,
                        socket,
                        conversationId,
                    );

                    acknowledge(callback, result);
                } catch (error) {
                    console.error(
                        "Typing stop failed:",
                        error,
                    );

                    acknowledge(callback, {
                        success: false,
                        message:
                            "Unable to update typing status.",
                    });
                }
            },
        );

        /*
         * Clean up when this socket disconnects.
         *
         * A user becomes offline only after their final
         * active socket disconnects.
         */
        socket.on("disconnecting", () => {
            clearSocketTypingSessions(
                socketServer,
                socket.id,
            );

            const presenceRemoval = unregisterPresence(
                socket.id,
                userId,
            );

            clearSocketRateLimits(socket.id);

            if (presenceRemoval.becameOffline) {
                broadcastPresenceToRooms(
                    socket,
                    "presence:offline",
                    userId,
                );
            }
        });
    });

    return socketServer;
}

/**
 * Returns the initialized Socket.IO server.
 */
export function getSocketIO(): Server {
    if (!io) {
        throw new Error(
            "Socket.IO has not been initialized.",
        );
    }

    return io;
}

/**
 * Removes every active socket belonging to a user from a
 * conversation room and notifies the affected sockets.
 *
 * Also clears the user's active typing sessions.
 *
 * The database authorization policy must independently prevent
 * the user from rejoining if their access has been revoked.
 */
export async function revokeUserFromConversationRoom(
    conversationId: string,
    userId: string,
): Promise<void> {
    if (
        !conversationId.trim() ||
        !userId.trim()
    ) {
        return;
    }

    const socketServer = getSocketIO();

    const roomName =
        `conversation:${conversationId}`;

    /*
     * Stop typing before removing sockets so the remaining
     * participants receive typing:stop.
     */
    clearUserTypingSessions(
        socketServer,
        conversationId,
        userId,
    );

    /*
     * Find sockets currently inside the conversation room.
     */
    const activeSockets = await socketServer
        .in(roomName)
        .fetchSockets();

    const affectedSockets = activeSockets.filter(
        (activeSocket) =>
            activeSocket.data.userId === userId,
    );

    /*
     * Notify affected clients before removing their sockets.
     */
    for (const activeSocket of affectedSockets) {
        activeSocket.emit(
            "conversation:access_revoked",
            {
                conversationId,
                message:
                    "Your access to this conversation has changed.",
            },
        );
    }

    /*
     * Remove all affected sockets.
     */
    await Promise.all(
        affectedSockets.map(
            async (activeSocket) => {
                await activeSocket.leave(roomName);
            },
        ),
    );
}