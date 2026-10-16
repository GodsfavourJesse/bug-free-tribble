import {
    and,
    asc,
    eq,
    inArray,
    sql,
} from "drizzle-orm";

import { db } from "../../database/index.ts";

import {
    boostPlans,
    listingBoosts,
    listings,
} from "../../database/schema/index.ts";

const RESERVED_BOOST_STATUSES = [
    "PENDING",
    "AWAITING_APPROVAL",
    "ACTIVE",
] as const;

/**
 * Detect PostgreSQL unique-constraint violations.
 */
function isUniqueConstraintViolation(
    error: unknown,
): boolean {
    return (
        typeof error === "object"
        && error !== null
        && "code" in error
        && error.code === "23505"
    );
}

/**
 * Return active boost plans ordered by duration and price.
 *
 * Inactive plans remain in the database but are not
 * available for new purchases.
 */
export async function getBoostPlans() {
    return db
        .select()
        .from(boostPlans)
        .where(
            eq(
                boostPlans.active,
                1,
            ),
        )
        .orderBy(
            asc(boostPlans.durationDays),
            asc(boostPlans.price),
        );
}

/**
 * Create a pending boost request for a listing owned
 * by the authenticated user.
 *
 * This function does not initialize payment, verify
 * payment, or activate the boost.
 *
 * A listing cannot have another boost request while
 * a previous request is pending, awaiting approval,
 * or active.
 */
export async function createBoost(
    userId: string,
    listingId: string,
    boostPlanId: string,
) {
    if (
        !userId
        || !listingId
        || !boostPlanId
    ) {
        throw new Error(
            "User, listing, and boost plan are required.",
        );
    }

    try {
        return await db.transaction(async (tx) => {
            /*
             * Lock requests for this listing so two
             * concurrent requests cannot both pass
             * the duplicate-request check.
             */
            await tx.execute(sql`
                SELECT pg_advisory_xact_lock(
                    hashtext(
                        ${`karmass:listing-boost:${listingId}`}
                    )
                )
            `);

            /*
             * Validate ownership, listing approval,
             * and boost-plan availability.
             */
            const records = await tx
                .select({
                    listingId: listings.id,
                    sellerId: listings.sellerId,
                    listingStatus: listings.status,

                    planId: boostPlans.id,
                    planDurationDays:
                        boostPlans.durationDays,
                    planPrice: boostPlans.price,
                    planCurrency: boostPlans.currency,
                    planActive: boostPlans.active,
                })
                .from(listings)
                .innerJoin(
                    boostPlans,
                    eq(
                        boostPlans.id,
                        boostPlanId,
                    ),
                )
                .where(
                    and(
                        eq(
                            listings.id,
                            listingId,
                        ),
                        eq(
                            listings.sellerId,
                            userId,
                        ),
                        eq(
                            listings.status,
                            "APPROVED",
                        ),
                        eq(
                            boostPlans.active,
                            1,
                        ),
                    ),
                )
                .limit(1);

            const record = records[0];

            if (!record) {
                throw new Error(
                    "The listing is unavailable for boosting, or the selected boost plan is inactive.",
                );
            }

            /*
             * Check every status that reserves the listing.
             *
             * PENDING:
             * The boost request has not completed payment.
             *
             * AWAITING_APPROVAL:
             * Payment was verified and administrator
             * review is pending.
             *
             * ACTIVE:
             * The boost is currently running.
             */
            const existingBoosts = await tx
                .select({
                    id: listingBoosts.id,
                    status: listingBoosts.status,
                })
                .from(listingBoosts)
                .where(
                    and(
                        eq(
                            listingBoosts.listingId,
                            listingId,
                        ),
                        inArray(
                            listingBoosts.status,
                            [
                                ...RESERVED_BOOST_STATUSES,
                            ],
                        ),
                    ),
                )
                .limit(1);

            if (existingBoosts[0]) {
                const existingStatus =
                    existingBoosts[0].status;

                if (existingStatus === "ACTIVE") {
                    throw new Error(
                        "This listing already has an active boost.",
                    );
                }

                if (
                    existingStatus
                    === "AWAITING_APPROVAL"
                ) {
                    throw new Error(
                        "This listing already has a paid boost awaiting administrator approval.",
                    );
                }

                throw new Error(
                    "This listing already has a pending boost request. Complete or resolve that request before creating another.",
                );
            }

            /*
             * Create a new request.
             *
             * Payment initialization is performed separately
             * by the existing payment module.
             */
            const created = await tx
                .insert(listingBoosts)
                .values({
                    listingId,
                    boostPlanId,
                    status: "PENDING",
                })
                .returning();

            const boost = created[0];

            if (!boost) {
                throw new Error(
                    "The boost request could not be created.",
                );
            }

            return boost;
        });
    } catch (error) {
        /*
         * The database's unique indexes remain the final
         * safeguard against conflicting requests.
         */
        if (isUniqueConstraintViolation(error)) {
            throw new Error(
                "This listing already has a pending, awaiting-approval, or active boost. Refresh the listing and check its current boost status.",
            );
        }

        throw error;
    }
}