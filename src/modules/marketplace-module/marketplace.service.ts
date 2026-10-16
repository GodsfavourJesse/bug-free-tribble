import {
    and,
    asc,
    desc,
    eq,
    gte,
    gt,
    ilike,
    isNull,
    lte,
    or,
    sql,
} from "drizzle-orm";

import { db } from "../../database/index.ts";

import {
    dealerProfiles,
    listings,
    users,
    vehicleGenerations,
    vehicleMakes,
    vehicleModels,
    vehicleVariants,
} from "../../database/schema/index.ts";
import { MarketplaceFilters, MarketplaceSearchProvider, MarketplaceSearchResult } from "./marketplace.types.ts";

function validateFilters(
    filters: MarketplaceFilters,
): void {
    if (
        filters.minPrice !== undefined
        && filters.maxPrice !== undefined
        && filters.minPrice > filters.maxPrice
    ) {
        throw new Error(
            "Minimum price cannot exceed maximum price.",
        );
    }

    if (
        filters.minMileage !== undefined
        && filters.maxMileage !== undefined
        && filters.minMileage > filters.maxMileage
    ) {
        throw new Error(
            "Minimum mileage cannot exceed maximum mileage.",
        );
    }

    if (
        filters.minYear !== undefined
        && filters.maxYear !== undefined
        && filters.minYear > filters.maxYear
    ) {
        throw new Error(
            "Minimum year cannot exceed maximum year.",
        );
    }

    for (const year of [
        filters.minYear,
        filters.maxYear,
    ]) {
        if (
            year !== undefined
            && (
                !Number.isInteger(year)
                || year < 1886
                || year > 2100
            )
        ) {
            throw new Error(
                "Year must be between 1886 and 2100.",
            );
        }
    }

    for (const value of [
        filters.minPrice,
        filters.maxPrice,
        filters.minMileage,
        filters.maxMileage,
    ]) {
        if (
            value !== undefined
            && (
                !Number.isFinite(value)
                || value < 0
            )
        ) {
            throw new Error(
                "Price and mileage filters must be non-negative numbers.",
            );
        }
    }

    if (
        filters.verifiedDealerOnly
        && filters.dealerOnly === false
    ) {
        throw new Error(
            "Verified-dealer filtering cannot be combined with dealerOnly=false.",
        );
    }
}

/**
 * PostgreSQL-backed marketplace search provider.
 *
 * The public search function is intentionally separate from
 * this implementation so a future OpenSearch/Elasticsearch
 * provider can replace it without changing controller contracts.
 */
class PostgresMarketplaceSearchProvider
implements MarketplaceSearchProvider {
    async search(
        filters: MarketplaceFilters,
    ): Promise<MarketplaceSearchResult> {
        validateFilters(filters);

        const now = new Date();

        const page =
            Number.isInteger(filters.page)
            && filters.page >= 1
                ? filters.page
                : 1;

        const limit =
            Number.isInteger(filters.limit)
            && filters.limit >= 1
            && filters.limit <= 50
                ? filters.limit
                : 20;

        const conditions = [
            eq(listings.status, "APPROVED"),

            or(
                isNull(listings.expiresAt),
                gt(listings.expiresAt, now),
            )!,
        ];

        if (filters.makeId) {
            conditions.push(
                eq(vehicleMakes.id, filters.makeId),
            );
        }

        if (filters.modelId) {
            conditions.push(
                eq(vehicleModels.id, filters.modelId),
            );
        }

        if (filters.variantId) {
            conditions.push(
                eq(vehicleVariants.id, filters.variantId),
            );
        }

        if (filters.condition) {
            conditions.push(
                eq(listings.condition, filters.condition),
            );
        }

        if (filters.state) {
            conditions.push(
                ilike(listings.state, filters.state),
            );
        }

        if (filters.city) {
            conditions.push(
                ilike(listings.city, filters.city),
            );
        }

        if (filters.minPrice !== undefined) {
            conditions.push(
                gte(
                    listings.price,
                    String(filters.minPrice),
                ),
            );
        }

        if (filters.maxPrice !== undefined) {
            conditions.push(
                lte(
                    listings.price,
                    String(filters.maxPrice),
                ),
            );
        }

        if (filters.minMileage !== undefined) {
            conditions.push(
                gte(
                    listings.mileage,
                    filters.minMileage,
                ),
            );
        }

        if (filters.maxMileage !== undefined) {
            conditions.push(
                lte(
                    listings.mileage,
                    filters.maxMileage,
                ),
            );
        }

        if (filters.minYear !== undefined) {
            conditions.push(
                gte(
                    vehicleVariants.year,
                    filters.minYear,
                ),
            );
        }

        if (filters.maxYear !== undefined) {
            conditions.push(
                lte(
                    vehicleVariants.year,
                    filters.maxYear,
                ),
            );
        }

        if (filters.fuelType) {
            conditions.push(
                eq(
                    vehicleVariants.fuelType,
                    filters.fuelType,
                ),
            );
        }

        if (filters.transmission) {
            conditions.push(
                eq(
                    vehicleVariants.transmission,
                    filters.transmission,
                ),
            );
        }

        if (filters.bodyStyle) {
            conditions.push(
                eq(
                    vehicleVariants.bodyStyle,
                    filters.bodyStyle,
                ),
            );
        }

        if (filters.dealerOnly) {
            conditions.push(
                eq(users.accountType, "DEALER"),
            );
        }

        if (filters.verifiedDealerOnly) {
            conditions.push(
                eq(users.accountType, "DEALER"),
                eq(dealerProfiles.verified, true),
            );
        }

        if (filters.q) {
            const pattern = `%${filters.q}%`;

            conditions.push(
                or(
                    ilike(listings.title, pattern),
                    ilike(listings.description, pattern),
                    ilike(vehicleMakes.name, pattern),
                    ilike(vehicleModels.name, pattern),
                    ilike(vehicleGenerations.name, pattern),
                    ilike(vehicleVariants.name, pattern),
                )!,
            );
        }

        const whereCondition = and(...conditions);

        /*
         * A listing is boosted only when an active boost's
         * time window is currently valid.
         */
        const activeBoostPriority = sql<number>`
            CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM listing_boosts AS boost
                    WHERE boost.listing_id = ${listings.id}
                      AND boost.status = 'ACTIVE'
                      AND boost.starts_at IS NOT NULL
                      AND boost.starts_at <= ${now}
                      AND boost.expires_at IS NOT NULL
                      AND boost.expires_at > ${now}
                )
                THEN 100
                ELSE 0
            END
        `;

        /*
         * Reuse the same joins and filters for the count query.
         * LEFT JOIN keeps non-dealer listings in the marketplace.
         */
        const [countResult] = await db
            .select({
                total: sql<number>`count(*)::int`,
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
            .innerJoin(
                users,
                eq(listings.sellerId, users.id),
            )
            .leftJoin(
                dealerProfiles,
                eq(dealerProfiles.userId, users.id),
            )
            .where(whereCondition);

        const total = countResult?.total ?? 0;
        const offset = (page - 1) * limit;

        const sort = filters.sort
            ?? (filters.q ? "relevance" : "newest");

        const orderBy = [];

        // Boost ranking is primary; selected sorting follows.
        orderBy.push(desc(activeBoostPriority));

        if (sort === "price_asc") {
            orderBy.push(
                asc(listings.price),
                desc(listings.createdAt),
                asc(listings.id),
            );
        } else if (sort === "price_desc") {
            orderBy.push(
                desc(listings.price),
                desc(listings.createdAt),
                asc(listings.id),
            );
        } else if (sort === "relevance" && filters.q) {
            const pattern = `%${filters.q}%`;

            const relevanceScore = sql<number>`
                CASE
                    WHEN ${listings.title} ILIKE ${pattern}
                        THEN 5
                    WHEN ${vehicleMakes.name} ILIKE ${pattern}
                        THEN 4
                    WHEN ${vehicleModels.name} ILIKE ${pattern}
                        THEN 4
                    WHEN ${vehicleVariants.name} ILIKE ${pattern}
                        THEN 4
                    WHEN ${vehicleGenerations.name} ILIKE ${pattern}
                        THEN 3
                    WHEN ${listings.description} ILIKE ${pattern}
                        THEN 1
                    ELSE 0
                END
            `;

            orderBy.push(
                desc(relevanceScore),
                desc(listings.createdAt),
                asc(listings.id),
            );
        } else {
            orderBy.push(
                desc(listings.createdAt),
                asc(listings.id),
            );
        }

        const results = await db
            .select({
                listing: listings,
                make: vehicleMakes,
                model: vehicleModels,
                generation: vehicleGenerations,
                variant: vehicleVariants,
                boostPriority: activeBoostPriority,
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
            .innerJoin(
                users,
                eq(listings.sellerId, users.id),
            )
            .leftJoin(
                dealerProfiles,
                eq(dealerProfiles.userId, users.id),
            )
            .where(whereCondition)
            .orderBy(...orderBy)
            .limit(limit)
            .offset(offset);

        const totalPages = Math.ceil(total / limit);

        return {
            listings: results,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1 && total > 0,
            },
        };
    }
}

const postgresMarketplaceSearchProvider =
    new PostgresMarketplaceSearchProvider();

/**
 * Stable service API.
 *
 * Replace the provider implementation later without requiring
 * changes to controllers or frontend marketplace requests.
 */
export async function searchMarketplace(
    filters: MarketplaceFilters,
): Promise<MarketplaceSearchResult> {
    return postgresMarketplaceSearchProvider.search(filters);
}