import type {
    Socket,
} from "socket.io";

import {
    canAccessConversation,
} from "../../modules/messaging-module/messaging-helpers/conversation-access.helper.ts";

export interface ConversationRoomResult {
    success: boolean;
    message?: string;
}

/**
 * Validates a conversation ID received from a socket event.
 */
function isValidConversationId(
    value: unknown,
): value is string {
    return (
        typeof value === "string" &&
        value.trim().length > 0 &&
        value.length <= 100
    );
}

/**
 * Checks whether a user is authorized to access a conversation.
 *
 * Authorization rules are centralized in canAccessConversation()
 * so HTTP messaging endpoints and Socket.IO use the same policy.
 *
 * BUYER_SELLER:
 * The user must be a conversation participant.
 *
 * SUPPORT:
 * The requester, currently assigned support agent, or a user
 * with the support:ticket:view_all permission may access the ticket.
 */
export async function isConversationParticipant(
    conversationId: string,
    userId: string,
): Promise<boolean> {
    if (
        !isValidConversationId(conversationId) ||
        !userId.trim()
    ) {
        return false;
    }

    return canAccessConversation(
        conversationId,
        userId,
    );
}

/**
 * Authorizes a socket against the current database policy
 * before joining a conversation room.
 */
export async function joinConversationRoom(
    socket: Socket,
    conversationId: unknown,
): Promise<ConversationRoomResult> {
    if (!isValidConversationId(conversationId)) {
        return {
            success: false,
            message: "Invalid conversation ID.",
        };
    }

    const userId: unknown = socket.data.userId;

    if (
        typeof userId !== "string" ||
        !userId.trim()
    ) {
        return {
            success: false,
            message: "Authentication required.",
        };
    }

    const authorized = await isConversationParticipant(
        conversationId,
        userId,
    );

    if (!authorized) {
        return {
            success: false,
            message: "You cannot access this conversation.",
        };
    }

    await socket.join(
        `conversation:${conversationId}`,
    );

    return {
        success: true,
    };
}

/**
 * Leaves a conversation room.
 *
 * Leaving does not require conversation authorization.
 * A user must be able to leave a room even after their
 * conversation access has been revoked.
 */
export async function leaveConversationRoom(
    socket: Socket,
    conversationId: unknown,
): Promise<ConversationRoomResult> {
    if (!isValidConversationId(conversationId)) {
        return {
            success: false,
            message: "Invalid conversation ID.",
        };
    }

    await socket.leave(
        `conversation:${conversationId}`,
    );

    return {
        success: true,
    };
}