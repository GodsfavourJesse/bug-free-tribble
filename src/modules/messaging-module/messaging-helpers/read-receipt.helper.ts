import {
    and,
    eq,
    sql,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    conversationParticipants,
    conversations,
} from "../../../database/schema/index.ts";

import { getSocketIO } from "../../../realtime/socket.ts";

import {
    isParticipant,
} from "./conversation.helper.ts";

export interface MessageReadReceipt {
    conversationId: string;
    userId: string;
    lastReadAt: Date | null;
}

/**
 * Marks a conversation as read for the authenticated user.
 *
 * Only a recorded conversation participant may update their
 * own read receipt.
 *
 * A support administrator with support:ticket:view_all may
 * view a ticket but cannot mark it as read as a participant
 * unless they have actually joined the conversation as one.
 */
export async function markConversationAsRead(
    conversationId: string,
    userId: string,
): Promise<MessageReadReceipt> {
    if (
        !conversationId.trim() ||
        !userId.trim()
    ) {
        throw new Error(
            "Conversation ID and user ID are required.",
        );
    }

    const authorized = await isParticipant(
        conversationId,
        userId,
    );

    if (!authorized) {
        throw new Error(
            "You are not authorized to access this conversation.",
        );
    }

    /*
     * A global support-view permission does not create a
     * participant row. The update is restricted to the
     * authenticated user's own participant record.
     */
    const updatedRows = await db
        .update(conversationParticipants)
        .set({
            lastReadAt: sql`
                GREATEST(
                    COALESCE(
                        ${conversationParticipants.lastReadAt},
                        '-infinity'::timestamptz
                    ),
                    NOW()
                )
            `,
        })
        .where(
            and(
                eq(
                    conversationParticipants.conversationId,
                    conversationId,
                ),
                eq(
                    conversationParticipants.userId,
                    userId,
                ),
            ),
        )
        .returning({
            conversationId:
                conversationParticipants.conversationId,
            userId:
                conversationParticipants.userId,
            lastReadAt:
                conversationParticipants.lastReadAt,
        });

    const receipt = updatedRows[0];

    if (!receipt) {
        throw new Error(
            "Only conversation participants can update their read receipts.",
        );
    }

    /*
     * Realtime delivery is best-effort.
     */
    try {
        getSocketIO()
            .to(`conversation:${conversationId}`)
            .emit("message:read", {
                conversationId,
                userId,
                lastReadAt: receipt.lastReadAt,
            });
    } catch (error) {
        console.error(
            "Read receipt realtime delivery failed.",
            error,
        );
    }

    return receipt;
}

/**
 * Retrieves read positions for a conversation.
 *
 * Any user authorized to view the conversation may inspect
 * its existing read receipts. Only recorded participants
 * may update their own read positions.
 */
export async function getConversationReadReceipts(
    conversationId: string,
    userId: string,
): Promise<MessageReadReceipt[]> {
    if (
        !conversationId.trim() ||
        !userId.trim()
    ) {
        throw new Error(
            "Conversation ID and user ID are required.",
        );
    }

    const authorized = await isParticipant(
        conversationId,
        userId,
    );

    if (!authorized) {
        throw new Error(
            "You are not authorized to view this conversation's read receipts.",
        );
    }

    /*
     * Confirm the conversation exists before returning receipts.
     * The access helper also checks this, but the explicit
     * query keeps the existence requirement clear.
     */
    const conversationRows = await db
        .select({
            id: conversations.id,
        })
        .from(conversations)
        .where(
            eq(
                conversations.id,
                conversationId,
            ),
        )
        .limit(1);

    if (!conversationRows[0]) {
        throw new Error(
            "Conversation not found.",
        );
    }

    return db
        .select({
            conversationId:
                conversationParticipants.conversationId,
            userId:
                conversationParticipants.userId,
            lastReadAt:
                conversationParticipants.lastReadAt,
        })
        .from(conversationParticipants)
        .where(
            eq(
                conversationParticipants.conversationId,
                conversationId,
            ),
        );
}