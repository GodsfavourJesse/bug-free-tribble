import {
    desc,
    eq,
    sql,
} from "drizzle-orm";
import { db } from "../../../../database/index.ts";
import { subscriptionHistory, subscriptions } from "../../../../database/schema/index.ts";


export class SubscriptionHistoryError extends Error {
    constructor(
        message: string,
        public readonly statusCode: number,
    ) {
        super(message);
        this.name = "SubscriptionHistoryError";
    }
}

export interface AdminSubscriptionHistoryInput {
    subscriptionId: string;
    page: number;
    limit: number;
}

export async function getAdminSubscriptionHistory(
    input: AdminSubscriptionHistoryInput,
) {
    const offset = (input.page - 1) * input.limit;

    // Confirm that the subscription exists.
    const existingSubscription = await db
        .select({
            id: subscriptions.id,
            userId: subscriptions.userId,
        })
        .from(subscriptions)
        .where(
            eq(subscriptions.id, input.subscriptionId),
        )
        .limit(1);

    if (!existingSubscription[0]) {
        throw new SubscriptionHistoryError(
            "Subscription not found.",
            404,
        );
    }

    const [items, countRows] = await Promise.all([
        db
            .select()
            .from(subscriptionHistory)
            .where(
                eq(
                    subscriptionHistory.subscriptionId,
                    input.subscriptionId,
                ),
            )
            .orderBy(
                desc(subscriptionHistory.createdAt),
                desc(subscriptionHistory.id),
            )
            .limit(input.limit)
            .offset(offset),

        db
            .select({
                count: sql<number>`count(*)::int`,
            })
            .from(subscriptionHistory)
            .where(
                eq(
                    subscriptionHistory.subscriptionId,
                    input.subscriptionId,
                ),
            ),
    ]);

    const total = Number(countRows[0]?.count ?? 0);

    return {
        items,
        pagination: {
            page: input.page,
            limit: input.limit,
            total,
            totalPages: Math.ceil(total / input.limit),
        },
    };
}