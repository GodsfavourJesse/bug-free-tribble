import type {
    Server,
    Socket,
} from "socket.io";

import {
    isConversationParticipant,
} from "./conversation-room.helper.ts";

interface TypingSession {
    timeout: ReturnType<typeof setTimeout>;
    socketId: string;
    userId: string;
    conversationId: string;
}

export interface TypingResult {
    success: boolean;
    message?: string;
}

const TYPING_TIMEOUT_MS = 5_000;

const typingSessions = new Map<
    string,
    TypingSession
>();

function getTypingSessionKey(
    conversationId: string,
    socketId: string,
): string {
    return `${conversationId}:${socketId}`;
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

function getAuthenticatedUserId(
    socket: Socket,
): string | null {
    const userId: unknown = socket.data.userId;

    if (
        typeof userId !== "string" ||
        userId.trim().length === 0
    ) {
        return null;
    }

    return userId;
}

function clearTypingSession(
    key: string,
): TypingSession | undefined {
    const session = typingSessions.get(key);

    if (!session) {
        return undefined;
    }

    clearTimeout(session.timeout);
    typingSessions.delete(key);

    return session;
}

function broadcastTypingStopped(
    io: Server,
    session: TypingSession,
): void {
    io.to(
        `conversation:${session.conversationId}`,
    ).emit("typing:stop", {
        conversationId: session.conversationId,
        userId: session.userId,
    });
}

/**
 * Stops one socket's typing session in a conversation.
 */
export function stopTyping(
    io: Server,
    socketId: string,
    conversationId: string,
): void {
    const key = getTypingSessionKey(
        conversationId,
        socketId,
    );

    const session = clearTypingSession(key);

    if (session) {
        broadcastTypingStopped(io, session);
    }
}

/**
 * Stops all typing sessions belonging to a socket.
 *
 * Call this when a socket disconnects.
 */
export function clearSocketTypingSessions(
    io: Server,
    socketId: string,
): void {
    for (const [key, session] of typingSessions) {
        if (session.socketId !== socketId) {
            continue;
        }

        const cleared = clearTypingSession(key);

        if (cleared) {
            broadcastTypingStopped(io, cleared);
        }
    }
}

/**
 * Stops every typing session belonging to a user
 * in a specific conversation.
 *
 * Useful when conversation access is revoked.
 */
export function clearUserTypingSessions(
    io: Server,
    conversationId: string,
    userId: string,
): void {
    for (const [key, session] of typingSessions) {
        if (
            session.conversationId !== conversationId ||
            session.userId !== userId
        ) {
            continue;
        }

        const cleared = clearTypingSession(key);

        if (cleared) {
            broadcastTypingStopped(io, cleared);
        }
    }
}

/**
 * Handles typing:start.
 *
 * The authenticated user ID always comes from the
 * server-side socket session, never the payload.
 */
export async function startTyping(
    io: Server,
    socket: Socket,
    conversationId: unknown,
): Promise<TypingResult> {
    if (!isValidConversationId(conversationId)) {
        return {
            success: false,
            message: "Invalid conversation ID.",
        };
    }

    const userId = getAuthenticatedUserId(socket);

    if (!userId) {
        return {
            success: false,
            message: "Authentication required.",
        };
    }

    const roomName = `conversation:${conversationId}`;

    if (!socket.rooms.has(roomName)) {
        return {
            success: false,
            message:
                "Join the conversation before sending typing events.",
        };
    }

    const authorized = await isConversationParticipant(
        conversationId,
        userId,
    );

    if (!authorized) {
        stopTyping(io, socket.id, conversationId);

        return {
            success: false,
            message:
                "You cannot access this conversation.",
        };
    }

    /*
     * Authorization is asynchronous. Confirm the socket
     * still belongs to the room after the database check.
     */
    if (!socket.rooms.has(roomName)) {
        stopTyping(io, socket.id, conversationId);

        return {
            success: false,
            message:
                "You are no longer in this conversation.",
        };
    }

    const key = getTypingSessionKey(
        conversationId,
        socket.id,
    );

    const existing = typingSessions.get(key);

    if (existing) {
        clearTimeout(existing.timeout);
    } else {
        socket.to(roomName).emit("typing:start", {
            conversationId,
            userId,
        });
    }

    const timeout = setTimeout(() => {
        const session = clearTypingSession(key);

        if (session) {
            broadcastTypingStopped(io, session);
        }
    }, TYPING_TIMEOUT_MS);

    typingSessions.set(key, {
        timeout,
        socketId: socket.id,
        userId,
        conversationId,
    });

    return {
        success: true,
    };
}

/**
 * Handles typing:stop.
 */
export async function handleTypingStop(
    io: Server,
    socket: Socket,
    conversationId: unknown,
): Promise<TypingResult> {
    if (!isValidConversationId(conversationId)) {
        return {
            success: false,
            message: "Invalid conversation ID.",
        };
    }

    const userId = getAuthenticatedUserId(socket);

    if (!userId) {
        return {
            success: false,
            message: "Authentication required.",
        };
    }

    const authorized = await isConversationParticipant(
        conversationId,
        userId,
    );

    /*
     * Clear the socket's own session even if access has
     * been revoked. Never accept another socket's ID
     * from the client.
     */
    stopTyping(io, socket.id, conversationId);

    if (!authorized) {
        return {
            success: false,
            message:
                "You cannot access this conversation.",
        };
    }

    return {
        success: true,
    };
}
