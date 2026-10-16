import {
    and,
    eq,
} from "drizzle-orm";

import {
    db,
} from "../../../database/index.ts";

import {
    conversationParticipants,
    conversations,
} from "../../../database/schema/index.ts";

import {
    userHasPermission,
} from "../../rbac/rbac.service.ts";

/**
 * Determines whether a user can access a conversation.
 *
 * BUYER_SELLER:
 *   Only recorded conversation participants can access it.
 *
 * SUPPORT:
 *   The requester and currently assigned agent can access it.
 *   Users with support:ticket:view_all can access all support
 *   conversations.
 *
 * A user with support:ticket:view alone cannot access every
 * support conversation.
 */
export async function canAccessConversation(
    conversationId: string,
    userId: string,
): Promise<boolean> {
    if (
        !conversationId.trim() ||
        !userId.trim()
    ) {
        return false;
    }

    const [conversation] = await db
        .select({
            id: conversations.id,
            type: conversations.type,
            requesterId: conversations.requesterId,
            assignedTo: conversations.assignedTo,
        })
        .from(conversations)
        .where(
            eq(
                conversations.id,
                conversationId,
            ),
        )
        .limit(1);

    if (!conversation) {
        return false;
    }

    if (conversation.type === "BUYER_SELLER") {
        const [participant] = await db
            .select({
                conversationId:
                    conversationParticipants.conversationId,
            })
            .from(conversationParticipants)
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
            .limit(1);

        return Boolean(participant);
    }

    if (conversation.type === "SUPPORT") {
        /*
         * The requester retains access to their own ticket.
         * The currently assigned agent can access the ticket.
         */
        if (
            conversation.requesterId === userId ||
            conversation.assignedTo === userId
        ) {
            return true;
        }

        /*
         * Only a dedicated permission grants global access.
         * The ordinary support:ticket:view permission must
         * not grant access to every user's support ticket.
         */
        return userHasPermission(
            userId,
            "support:ticket:view_all",
        );
    }

    return false;
}