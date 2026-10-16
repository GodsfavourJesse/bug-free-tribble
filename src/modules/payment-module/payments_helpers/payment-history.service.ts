import {
    eq,
    sql,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    payments,
} from "../../../database/schema/index.ts";

export async function listUserPayments(
    userId: string,
    limit = 30,
    offset = 0,
) {
    const safeLimit =
        Math.min(
            Math.max(
                limit,
                1,
            ),
            100,
        );

    const safeOffset =
        Math.max(
            offset,
            0,
        );

    return db
        .select({
            id:
                payments.id,

            purpose:
                payments.purpose,

            status:
                payments.status,

            reference:
                payments.reference,

            amount:
                payments.amount,

            originalAmount:
                payments.originalAmount,

            discountPercent:
                payments.discountPercent,

            discountAmount:
                payments.discountAmount,

            currency:
                payments.currency,

            subscriptionId:
                payments.subscriptionId,

            listingBoostId:
                payments.listingBoostId,

            gatewayTransactionId:
                payments.gatewayTransactionId,

            paidAt:
                payments.paidAt,

            createdAt:
                payments.createdAt,

            updatedAt:
                payments.updatedAt,
        })
        .from(payments)
        .where(
            eq(
                payments.userId,
                userId,
            ),
        )
        .orderBy(
            sql`${payments.createdAt} DESC`,
        )
        .limit(
            safeLimit,
        )
        .offset(
            safeOffset,
        );
}