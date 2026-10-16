import {
    desc,
    eq,
    sql,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    boostPlans,
    listingBoosts,
    listings,
} from "../../../database/schema/index.ts";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function getUserBoostHistory(
    userId: string,
    page = DEFAULT_PAGE,
    limit = DEFAULT_LIMIT,
) {
    const normalizedPage =
        Number.isInteger(page) && page > 0
            ? page
            : DEFAULT_PAGE;

    const normalizedLimit =
        Number.isInteger(limit)
        && limit > 0
            ? Math.min(limit, MAX_LIMIT)
            : DEFAULT_LIMIT;

    const offset =
        (normalizedPage - 1) * normalizedLimit;

    const userListings = db
        .select({
            id: listings.id,
        })
        .from(listings)
        .where(
            eq(listings.sellerId, userId),
        );

    const [items, countRows] = await Promise.all([
        db
            .select({
                id: listingBoosts.id,
                listingId: listingBoosts.listingId,
                boostPlanId: listingBoosts.boostPlanId,
                status: listingBoosts.status,
                paymentVerifiedAt:
                    listingBoosts.paymentVerifiedAt,
                reviewedAt: listingBoosts.reviewedAt,
                reviewNote: listingBoosts.reviewNote,
                startsAt: listingBoosts.startsAt,
                expiresAt: listingBoosts.expiresAt,
                createdAt: listingBoosts.createdAt,

                durationDays: boostPlans.durationDays,
                price: boostPlans.price,
                currency: boostPlans.currency,

                listingTitle: listings.title,
                listingStatus: listings.status,
            })
            .from(listingBoosts)
            .innerJoin(
                boostPlans,
                eq(
                    listingBoosts.boostPlanId,
                    boostPlans.id,
                ),
            )
            .innerJoin(
                listings,
                eq(
                    listingBoosts.listingId,
                    listings.id,
                ),
            )
            .where(
                eq(listings.sellerId, userId),
            )
            .orderBy(
                desc(listingBoosts.createdAt),
            )
            .limit(normalizedLimit)
            .offset(offset),

        db
            .select({
                total: sql<number>`count(*)::int`,
            })
            .from(listingBoosts)
            .where(
                sql`${listingBoosts.listingId} IN (${userListings})`,
            ),
    ]);

    const total = countRows[0]?.total ?? 0;

    return {
        items,
        pagination: {
            page: normalizedPage,
            limit: normalizedLimit,
            total,
            totalPages: Math.ceil(
                total / normalizedLimit,
            ),
        },
    };
}