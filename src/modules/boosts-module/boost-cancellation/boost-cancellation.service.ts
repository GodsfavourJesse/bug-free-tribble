import { and, eq, sql } from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    listingBoosts,
    listings,
    payments,
} from "../../../database/schema/index.ts";

/**
 * Cancel a pending boost belonging to the authenticated user.
 *
 * Cancellation is serialized with payment fulfillment and
 * payment initialization through the listing-level advisory lock.
 *
 * Payment records are never deleted or rewritten during cancellation.
 */
export async function cancelPendingBoost(
    userId: string,
    boostId: string,
) {
    if (!userId || !boostId) {
        throw new Error("User ID and boost ID are required.");
    }

    return db.transaction(async (tx) => {
        const rows = await tx
            .select({
                boostId: listingBoosts.id,
                listingId: listings.id,
                status: listingBoosts.status,
            })
            .from(listingBoosts)
            .innerJoin(
                listings,
                eq(listings.id, listingBoosts.listingId),
            )
            .where(
                and(
                    eq(listingBoosts.id, boostId),
                    eq(listings.sellerId, userId),
                ),
            )
            .limit(1);

        const boost = rows[0];

        if (!boost) {
            throw new Error("Boost not found.");
        }

        /*
         * This lock key must match the key used by:
         * - payment fulfillment
         * - payment initialization
         * - cancellation
         */
        await tx.execute(sql`
            SELECT pg_advisory_xact_lock(
                hashtext(
                    ${`karmass:listing-boost:${boost.listingId}`}
                )
            )
        `);

        const lockedRows = await tx
            .select({
                id: listingBoosts.id,
                status: listingBoosts.status,
            })
            .from(listingBoosts)
            .where(eq(listingBoosts.id, boostId))
            .limit(1);

        const lockedBoost = lockedRows[0];

        if (!lockedBoost) {
            throw new Error("Boost not found.");
        }

        if (lockedBoost.status !== "PENDING") {
            throw new Error(
                `Only pending boosts can be cancelled. Current status: ${lockedBoost.status}.`,
            );
        }

        /*
         * Inspect every payment associated with this boost.
         *
         * A pending or processing payment could already have
         * succeeded at Paystack even if our database has not
         * received or processed the successful-payment event.
         */
        const associatedPayments = await tx
            .select({
                id: payments.id,
                status: payments.status,
            })
            .from(payments)
            .where(
                and(
                    eq(payments.listingBoostId, boostId),
                    eq(payments.purpose, "BOOST"),
                ),
            );

        const unresolvedPayments = associatedPayments.filter(
            (payment) =>
                payment.status === "PENDING" ||
                payment.status === "PROCESSING" ||
                payment.status === "SUCCESS" ||
                payment.status === "REVERSED",
        );

        if (unresolvedPayments.length > 0) {
            throw new Error(
                "This boost has a payment that must be reconciled before cancellation. Verify the payment status and try again.",
            );
        }

        /*
         * FAILED and ABANDONED payments are retained as history.
         * A boost can be cancelled if all its associated payments
         * are in these terminal states.
         */
        const cancelledRows = await tx
            .update(listingBoosts)
            .set({
                status: "CANCELLED",
            })
            .where(
                and(
                    eq(listingBoosts.id, boostId),
                    eq(listingBoosts.status, "PENDING"),
                ),
            )
            .returning();

        const cancelledBoost = cancelledRows[0];

        if (!cancelledBoost) {
            throw new Error(
                "Boost cancellation failed. Refresh and check its status.",
            );
        }

        return {
            boost: cancelledBoost,
            message: "Pending boost cancelled successfully.",
        };
    });
}