import {
    and,
    count,
    desc,
    eq,
    gt,
    isNull,
    or,
    sql,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    dealerProfiles,
    listings,
    users,
    vehicleGenerations,
    vehicleMakes,
    vehicleModels,
    vehicleVariants,
} from "../../../database/schema/index.ts";

import { AppError } from "../../../errors/app-error.ts";

export async function getDealerAnalytics(
    dealerUserId: string,
) {
    const normalizedUserId = dealerUserId.trim();

    const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(normalizedUserId)) {
        throw new AppError(
            "Invalid dealer ID.",
            400,
            "INVALID_DEALER_ID",
        );
    }

    /*
     * Only approved dealer accounts can access dealer analytics.
     */
    const dealer = await db
        .select({
            userId: dealerProfiles.userId,
        })
        .from(dealerProfiles)
        .innerJoin(
            users,
            eq(
                dealerProfiles.userId,
                users.id,
            ),
        )
        .where(
            and(
                eq(
                    dealerProfiles.userId,
                    normalizedUserId,
                ),
                eq(
                    dealerProfiles.verified,
                    true,
                ),
                eq(
                    users.accountType,
                    "DEALER",
                ),
            ),
        )
        .limit(1);

    if (!dealer[0]) {
        throw new AppError(
            "Verified dealer account not found.",
            404,
            "DEALER_NOT_FOUND",
        );
    }

    const now = new Date();

    /*
     * Calculate listing statistics in one database query.
     *
     * Deleted listings are excluded from totalListings.
     * Expired listings are counted by their EXPIRED status.
     * Approved listings past expiresAt are not considered active.
     */
    const statisticsResult = await db
        .select({
            totalListings: sql<number>`
                COUNT(*) FILTER (
                    WHERE ${listings.status} <> 'DELETED'
                )::int
            `,

            activeListings: sql<number>`
                COUNT(*) FILTER (
                    WHERE
                        ${listings.status} = 'APPROVED'
                        AND (
                            ${listings.expiresAt} IS NULL
                            OR ${listings.expiresAt} > ${now}
                        )
                )::int
            `,

            pendingListings: sql<number>`
                COUNT(*) FILTER (
                    WHERE ${listings.status} = 'PENDING_REVIEW'
                )::int
            `,

            rejectedListings: sql<number>`
                COUNT(*) FILTER (
                    WHERE ${listings.status} = 'REJECTED'
                )::int
            `,

            soldListings: sql<number>`
                COUNT(*) FILTER (
                    WHERE ${listings.status} = 'SOLD'
                )::int
            `,

            expiredListings: sql<number>`
                COUNT(*) FILTER (
                    WHERE
                        ${listings.status} = 'EXPIRED'
                        OR (
                            ${listings.status} = 'APPROVED'
                            AND ${listings.expiresAt} IS NOT NULL
                            AND ${listings.expiresAt} <= ${now}
                        )
                )::int
            `,

            totalViews: sql<number>`
                COALESCE(
                    SUM(${listings.viewCount}),
                    0
                )::int
            `,

            averageViewsPerListing: sql<number>`
                COALESCE(
                    ROUND(
                        AVG(${listings.viewCount}) FILTER (
                            WHERE ${listings.status} <> 'DELETED'
                        ),
                        2
                    ),
                    0
                )::numeric
            `,
        })
        .from(listings)
        .where(
            eq(
                listings.sellerId,
                normalizedUserId,
            ),
        );

    const stats = statisticsResult[0];

    /*
     * Retrieve the five most recent listings.
     *
     * Return only the fields required by the dashboard.
     * Do not expose private listing image storage keys here.
     */
    const recentListings = await db
        .select({
            id: listings.id,
            title: listings.title,
            price: listings.price,
            currency: listings.currency,
            status: listings.status,
            viewCount: listings.viewCount,
            createdAt: listings.createdAt,
            expiresAt: listings.expiresAt,

            variantName: vehicleVariants.name,
            generationName: vehicleGenerations.name,
            modelName: vehicleModels.name,
            makeName: vehicleMakes.name,
        })
        .from(listings)
        .innerJoin(
            vehicleVariants,
            eq(
                listings.vehicleVariantId,
                vehicleVariants.id,
            ),
        )
        .innerJoin(
            vehicleGenerations,
            eq(
                vehicleVariants.generationId,
                vehicleGenerations.id,
            ),
        )
        .innerJoin(
            vehicleModels,
            eq(
                vehicleGenerations.modelId,
                vehicleModels.id,
            ),
        )
        .innerJoin(
            vehicleMakes,
            eq(
                vehicleModels.makeId,
                vehicleMakes.id,
            ),
        )
        .where(
            and(
                eq(
                    listings.sellerId,
                    normalizedUserId,
                ),
                sql`${listings.status} <> 'DELETED'`,
            ),
        )
        .orderBy(
            desc(listings.createdAt),
        )
        .limit(5);

    return {
        totalListings: Number(
            stats?.totalListings ?? 0,
        ),

        activeListings: Number(
            stats?.activeListings ?? 0,
        ),

        pendingListings: Number(
            stats?.pendingListings ?? 0,
        ),

        rejectedListings: Number(
            stats?.rejectedListings ?? 0,
        ),

        soldListings: Number(
            stats?.soldListings ?? 0,
        ),

        expiredListings: Number(
            stats?.expiredListings ?? 0,
        ),

        totalViews: Number(
            stats?.totalViews ?? 0,
        ),

        averageViewsPerListing: Number(
            stats?.averageViewsPerListing ?? 0,
        ),

        recentListings,
    };
}