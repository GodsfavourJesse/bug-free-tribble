import {
    and,
    count,
    desc,
    eq,
    gt,
    inArray,
    isNull,
    ne,
    or,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    conversationParticipants,
    conversations,
    listingImages,
    listings,
    messages,
    users,
} from "../../../database/schema/index.ts";
import { getObjectStorage } from "../../../infrastructure/storage/object-storage.ts";

export interface ConversationListOptions {
    page: number;
    limit: number;
}

/**
 * Returns paginated conversations belonging to a user.
 *
 * Includes:
 * - Other participants' public profiles
 * - Latest message
 * - Unread incoming-message count
 * - Pagination metadata
 */
export async function getConversations(
    userId: string,
    options: ConversationListOptions,
) {
    const {
        page,
        limit,
    } = options;

    const offset = (page - 1) * limit;

    const [
        conversationRows,
        totalRows,
    ] = await Promise.all([
        db
            .select({
                id: conversations.id,
                type: conversations.type,
                listingId: conversations.listingId,
                createdAt: conversations.createdAt,
                updatedAt: conversations.updatedAt,
            })
            .from(conversationParticipants)
            .innerJoin(
                conversations,
                eq(
                    conversations.id,
                    conversationParticipants.conversationId,
                ),
            )
            .where(
                eq(
                    conversationParticipants.userId,
                    userId,
                ),
            )
            .orderBy(
                desc(conversations.updatedAt),
                desc(conversations.id),
            )
            .limit(limit)
            .offset(offset),

        db
            .select({
                total: count(),
            })
            .from(conversationParticipants)
            .where(
                eq(
                    conversationParticipants.userId,
                    userId,
                ),
            ),
    ]);

    const total =
        totalRows[0]?.total ?? 0;

    const totalPages =
        Math.ceil(total / limit);

    if (conversationRows.length === 0) {
        return {
            conversations: [],
            pagination: {
                page,
                limit,
                total,
                totalPages,
            },
        };
    }

    const conversationIds =
        conversationRows.map(
            (conversation) => conversation.id,
        );

    const listingIds = Array.from(
        new Set(
            conversationRows
                .map((conversation) => conversation.listingId)
                .filter((listingId): listingId is string => Boolean(listingId)),
        ),
    );

    const listingContextRows = listingIds.length
        ? await db
            .select({
                id: listings.id,
                title: listings.title,
                price: listings.price,
                currency: listings.currency,
                city: listings.city,
                state: listings.state,
                imageKey: listingImages.objectKey,
            })
            .from(listings)
            .leftJoin(
                listingImages,
                and(
                    eq(listingImages.listingId, listings.id),
                    eq(listingImages.sortOrder, 0),
                ),
            )
            .where(inArray(listings.id, listingIds))
        : [];

    const storage = getObjectStorage();
    const listingContextById = new Map(
        listingContextRows.map((listing) => [
            listing.id,
            {
                id: listing.id,
                title: listing.title,
                price: listing.price,
                currency: listing.currency,
                location: [listing.city, listing.state].filter(Boolean).join(", "),
                imageUrl: listing.imageKey
                    ? storage.transformedImageUrl(listing.imageKey, {
                        width: 480,
                        height: 320,
                        quality: "auto",
                        format: "webp",
                    })
                    : null,
            },
        ]),
    );

    const participantRows = await db
        .select({
            conversationId:
                conversationParticipants.conversationId,

            userId: users.id,
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
            inArray(
                conversationParticipants.conversationId,
                conversationIds,
            ),
        );

    const latestMessageRows = await db
        .selectDistinctOn(
            [
                messages.conversationId,
            ],
            {
                id: messages.id,
                conversationId:
                    messages.conversationId,
                senderId: messages.senderId,
                body: messages.body,
                createdAt: messages.createdAt,
            },
        )
        .from(messages)
        .where(
            inArray(
                messages.conversationId,
                conversationIds,
            ),
        )
        .orderBy(
            messages.conversationId,
            desc(messages.createdAt),
            desc(messages.id),
        );

    const unreadRows = await db
        .select({
            conversationId:
                messages.conversationId,

            unreadCount:
                count(messages.id),
        })
        .from(messages)
        .innerJoin(
            conversationParticipants,
            and(
                eq(
                    conversationParticipants.conversationId,
                    messages.conversationId,
                ),
                eq(
                    conversationParticipants.userId,
                    userId,
                ),
            ),
        )
        .where(
            and(
                inArray(
                    messages.conversationId,
                    conversationIds,
                ),
                ne(
                    messages.senderId,
                    userId,
                ),
                or(
                    isNull(
                        conversationParticipants.lastReadAt,
                    ),
                    gt(
                        messages.createdAt,
                        conversationParticipants.lastReadAt,
                    ),
                ),
            ),
        )
        .groupBy(
            messages.conversationId,
        );

    const participantsByConversation =
        new Map<
            string,
            Array<{
                userId: string;
                firstName: string;
                lastName: string;
                avatarUrl: string | null;
                accountType:
                    typeof users.$inferSelect.accountType;
            }>
        >();

    for (const participant of participantRows) {
        if (participant.userId === userId) {
            continue;
        }

        const participants =
            participantsByConversation.get(
                participant.conversationId,
            ) ?? [];

        participants.push({
            userId: participant.userId,
            firstName: participant.firstName,
            lastName: participant.lastName,
            avatarUrl: participant.avatarUrl,
            accountType: participant.accountType,
        });

        participantsByConversation.set(
            participant.conversationId,
            participants,
        );
    }

    const latestMessageByConversation =
        new Map<
            string,
            (typeof latestMessageRows)[number]
        >();

    for (const message of latestMessageRows) {
        latestMessageByConversation.set(
            message.conversationId,
            message,
        );
    }

    const unreadCountByConversation =
        new Map<string, number>();

    for (const row of unreadRows) {
        unreadCountByConversation.set(
            row.conversationId,
            row.unreadCount,
        );
    }

    const conversationList =
        conversationRows.map((conversation) => {
            const lastMessage =
                latestMessageByConversation.get(
                    conversation.id,
                );

            return {
                id: conversation.id,
                type: conversation.type,
                listing: conversation.listingId
                    ? listingContextById.get(conversation.listingId) ?? null
                    : null,

                participants:
                    participantsByConversation.get(
                        conversation.id,
                    ) ?? [],

                lastMessage: lastMessage
                    ? {
                        id: lastMessage.id,
                        senderId: lastMessage.senderId,
                        body: lastMessage.body,
                        createdAt: lastMessage.createdAt,
                    }
                    : null,

                unreadCount:
                    unreadCountByConversation.get(
                        conversation.id,
                    ) ?? 0,

                createdAt: conversation.createdAt,
                updatedAt: conversation.updatedAt,
            };
        });

    return {
        conversations: conversationList,
        pagination: {
            page,
            limit,
            total,
            totalPages,
        },
    };
}

/** Total unread incoming messages for a user's navigation badge. */
export async function getUnreadMessageCount(userId: string): Promise<number> {
    const rows = await db
        .select({ total: count(messages.id) })
        .from(messages)
        .innerJoin(
            conversationParticipants,
            and(
                eq(conversationParticipants.conversationId, messages.conversationId),
                eq(conversationParticipants.userId, userId),
            ),
        )
        .where(
            and(
                ne(messages.senderId, userId),
                or(
                    isNull(conversationParticipants.lastReadAt),
                    gt(messages.createdAt, conversationParticipants.lastReadAt),
                ),
            ),
        );

    return rows[0]?.total ?? 0;
}
