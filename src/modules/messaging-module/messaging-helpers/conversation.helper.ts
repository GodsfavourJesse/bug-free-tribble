import {
    and,
    asc,
    count,
    desc,
    eq,
    gt,
    inArray,
    ne,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    conversationParticipants,
    conversations,
    messages,
    users,
} from "../../../database/schema/index.ts";

import {
    canAccessConversation,
} from "./conversation-access.helper.ts";

export interface ConversationListOptions {
    page?: number;
    limit?: number;
}

const DEFAULT_CONVERSATION_PAGE = 1;
const DEFAULT_CONVERSATION_LIMIT = 20;
const MAX_CONVERSATION_LIMIT = 50;

/**
 * Creates a buyer-seller conversation or returns an existing one.
 *
 * A conversation can only be reused when it contains exactly
 * the two requested participants.
 */
export async function createConversation(
    userId: string,
    otherUserId: string,
) {
    if (
        !userId.trim() ||
        !otherUserId.trim()
    ) {
        throw new Error(
            "Both user IDs are required.",
        );
    }

    if (userId === otherUserId) {
        throw new Error(
            "You cannot message yourself.",
        );
    }

    const existingUsers = await db
        .select({
            id: users.id,
        })
        .from(users)
        .where(
            inArray(
                users.id,
                [userId, otherUserId],
            ),
        );

    if (existingUsers.length !== 2) {
        throw new Error(
            "One or both users do not exist.",
        );
    }

    /*
     * Find conversations containing either requested user.
     */
    const participantRows = await db
        .select({
            conversationId:
                conversationParticipants.conversationId,
            userId:
                conversationParticipants.userId,
        })
        .from(conversationParticipants)
        .where(
            inArray(
                conversationParticipants.userId,
                [userId, otherUserId],
            ),
        );

    const participantMap =
        new Map<string, Set<string>>();

    for (const row of participantRows) {
        const participantSet =
            participantMap.get(row.conversationId) ??
            new Set<string>();

        participantSet.add(row.userId);

        participantMap.set(
            row.conversationId,
            participantSet,
        );
    }

    for (const [conversationId, participants] of participantMap) {
        if (
            participants.size !== 2 ||
            !participants.has(userId) ||
            !participants.has(otherUserId)
        ) {
            continue;
        }

        const existing = await db
            .select()
            .from(conversations)
            .where(
                and(
                    eq(
                        conversations.id,
                        conversationId,
                    ),
                    eq(
                        conversations.type,
                        "BUYER_SELLER",
                    ),
                ),
            )
            .limit(1);

        if (existing[0]) {
            return existing[0];
        }
    }

    /*
     * Create the conversation and both participant records
     * atomically.
     */
    return db.transaction(async (tx) => {
        const created = await tx
            .insert(conversations)
            .values({
                type: "BUYER_SELLER",
            })
            .returning();

        const conversation = created[0];

        if (!conversation) {
            throw new Error(
                "Unable to create conversation.",
            );
        }

        await tx
            .insert(conversationParticipants)
            .values([
                {
                    conversationId: conversation.id,
                    userId,
                },
                {
                    conversationId: conversation.id,
                    userId: otherUserId,
                },
            ]);

        return conversation;
    });
}

/**
 * Checks whether a user is authorized to access a conversation.
 *
 * Retained for compatibility with existing service imports.
 *
 * Note that authorization does not necessarily mean the user
 * has a participant record. For example, an administrator with
 * support:ticket:view_all may view a support ticket without
 * being a conversation participant.
 */
export async function isParticipant(
    conversationId: string,
    userId: string,
): Promise<boolean> {
    return canAccessConversation(
        conversationId,
        userId,
    );
}

/**
 * Returns the authenticated user's conversation list.
 *
 * Includes:
 * - Conversation information.
 * - Participant details.
 * - Last message.
 * - Unread message count.
 * - Pagination metadata.
 *
 * This endpoint lists conversations in which the user has
 * an actual participant record. Global support-ticket viewing
 * is handled separately from participant conversation lists.
 */
export async function listConversations(
    userId: string,
    options: ConversationListOptions = {},
) {
    if (!userId.trim()) {
        throw new Error(
            "User ID is required.",
        );
    }

    const page =
        options.page ?? DEFAULT_CONVERSATION_PAGE;

    const limit =
        options.limit ?? DEFAULT_CONVERSATION_LIMIT;

    if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > MAX_CONVERSATION_LIMIT
    ) {
        throw new Error(
            "Invalid conversation pagination options.",
        );
    }

    const offset = (page - 1) * limit;

    if (!Number.isSafeInteger(offset)) {
        throw new Error(
            "Conversation pagination offset is too large.",
        );
    }

    /*
     * Get conversations in which this user has a participant
     * record, including their personal read position.
     */
    const participantRows = await db
        .select({
            conversationId:
                conversationParticipants.conversationId,
            lastReadAt:
                conversationParticipants.lastReadAt,
        })
        .from(conversationParticipants)
        .where(
            eq(
                conversationParticipants.userId,
                userId,
            ),
        );

    const total = participantRows.length;

    if (total === 0) {
        return {
            conversations: [],
            pagination: {
                page,
                limit,
                total: 0,
                totalPages: 0,
            },
        };
    }

    const participantByConversation = new Map(
        participantRows.map((participant) => [
            participant.conversationId,
            participant,
        ]),
    );

    const conversationIds = participantRows.map(
        (participant) => participant.conversationId,
    );

    /*
     * Fetch conversations in most-recently-updated order.
     */
    const conversationRows = await db
        .select()
        .from(conversations)
        .where(
            inArray(
                conversations.id,
                conversationIds,
            ),
        )
        .orderBy(
            desc(conversations.updatedAt),
            desc(conversations.id),
        );

    const paginatedConversations =
        conversationRows.slice(offset, offset + limit);

    /*
     * Enrich each conversation with participants,
     * the last message, and the unread count.
     */
    const enrichedConversations = await Promise.all(
        paginatedConversations.map(
            async (conversation) => {
                const participant =
                    participantByConversation.get(
                        conversation.id,
                    );

                const lastReadAt =
                    participant?.lastReadAt ?? null;

                const [
                    participantDetails,
                    lastMessages,
                    unreadRows,
                ] = await Promise.all([
                    db
                        .select({
                            userId: conversationParticipants.userId,
                            lastReadAt: conversationParticipants.lastReadAt,
                            firstName: users.firstName,
                            lastName: users.lastName,
                            avatarUrl: users.avatarUrl,
                            accountType: users.accountType,
                        })
                        .from(conversationParticipants)
                        .innerJoin(
                            users,
                            eq(
                                users.id,
                                conversationParticipants.userId,
                            ),
                        )
                        .where(
                            eq(
                                conversationParticipants.conversationId,
                                conversation.id,
                            ),
                        ),

                    db
                        .select()
                        .from(messages)
                        .where(
                            eq(
                                messages.conversationId,
                                conversation.id,
                            ),
                        )
                        .orderBy(
                            desc(messages.createdAt),
                            desc(messages.id),
                        )
                        .limit(1),

                    lastReadAt === null
                        ? db
                            .select({
                                total: count(),
                            })
                            .from(messages)
                            .where(
                                and(
                                    eq(
                                        messages.conversationId,
                                        conversation.id,
                                    ),
                                    ne(
                                        messages.senderId,
                                        userId,
                                    ),
                                ),
                            )
                        : db
                            .select({
                                total: count(),
                            })
                            .from(messages)
                            .where(
                                and(
                                    eq(
                                        messages.conversationId,
                                        conversation.id,
                                    ),
                                    ne(
                                        messages.senderId,
                                        userId,
                                    ),
                                    gt(
                                        messages.createdAt,
                                        lastReadAt,
                                    ),
                                ),
                            ),
                ]);

                return {
                    ...conversation,

                    participants: participantDetails,

                    lastMessage:
                        lastMessages[0] ?? null,

                    unreadCount:
                        unreadRows[0]?.total ?? 0,
                };
            },
        ),
    );

    return {
        conversations: enrichedConversations,

        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}