import {
    and,
    desc,
    eq,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    conversationParticipants,
    conversations,
    users,
} from "../../../database/schema/index.ts";

/**
 * Creates a support ticket for an authenticated customer.
 *
 * The requester is automatically added as a participant
 * so the existing messaging authorization continues to work.
 */
export async function createSupportTicket(
    requesterId: string,
    subject: string,
) {
    const normalizedSubject = subject.trim();

    if (!requesterId.trim()) {
        throw new Error(
            "Authentication is required to create a support ticket.",
        );
    }

    if (
        normalizedSubject.length < 5 ||
        normalizedSubject.length > 150
    ) {
        throw new Error(
            "The ticket subject must be between 5 and 150 characters.",
        );
    }

    const requester = await db
        .select({
            id: users.id,
        })
        .from(users)
        .where(
            eq(users.id, requesterId),
        )
        .limit(1);

    if (!requester[0]) {
        throw new Error(
            "The requesting user does not exist.",
        );
    }

    return db.transaction(async (tx) => {
        const created = await tx
            .insert(conversations)
            .values({
                type: "SUPPORT",
                subject: normalizedSubject,
                requesterId,
                status: "OPEN",
            })
            .returning();

        const ticket = created[0];

        if (!ticket) {
            throw new Error(
                "Unable to create the support ticket.",
            );
        }

        await tx
            .insert(conversationParticipants)
            .values({
                conversationId: ticket.id,
                userId: requesterId,
            });

        return ticket;
    });
}

/**
 * Returns support tickets created by a specific customer.
 *
 * Customers cannot use this function to retrieve another
 * customer's tickets because results are filtered by requesterId.
 */
export async function getMySupportTickets(
    requesterId: string,
    page = 1,
    limit = 20,
) {
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(
        50,
        Math.max(1, Math.floor(limit)),
    );

    const offset = (safePage - 1) * safeLimit;

    const tickets = await db
        .select()
        .from(conversations)
        .where(
            and(
                eq(
                    conversations.type,
                    "SUPPORT",
                ),
                eq(
                    conversations.requesterId,
                    requesterId,
                ),
            ),
        )
        .orderBy(
            desc(conversations.updatedAt),
            desc(conversations.createdAt),
        )
        .limit(safeLimit)
        .offset(offset);

    return {
        tickets,
        pagination: {
            page: safePage,
            limit: safeLimit,
            hasMore: tickets.length === safeLimit,
        },
    };
}

/**
 * Checks whether a support ticket belongs to a requester.
 */
export async function isSupportTicketRequester(
    conversationId: string,
    requesterId: string,
): Promise<boolean> {
    const result = await db
        .select({
            id: conversations.id,
        })
        .from(conversations)
        .where(
            and(
                eq(
                    conversations.id,
                    conversationId,
                ),
                eq(
                    conversations.type,
                    "SUPPORT",
                ),
                eq(
                    conversations.requesterId,
                    requesterId,
                ),
            ),
        )
        .limit(1);

    return Boolean(result[0]);
}