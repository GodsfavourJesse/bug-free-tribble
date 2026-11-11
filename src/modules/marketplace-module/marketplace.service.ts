import {
    and,
    asc,
    desc,
    eq,
    gte,
    gt,
    ilike,
    inArray,
    isNull,
    lte,
    or,
    sql,
    type SQL,
} from "drizzle-orm";

import { db } from "../../database/index.ts";

import {
    dealerProfiles,
    listingImages,
    listings,
    users,
    vehicleGenerations,
    vehicleMakes,
    vehicleModels,
    vehicleVariants,
} from "../../database/schema/index.ts";

import type {
    MarketplaceFilters,
    MarketplaceImage,
    MarketplaceSearchProvider,
    MarketplaceSearchResult,
} from "./marketplace.types.ts";

import {
    getObjectStorage,
} from "../../infrastructure/storage/object-storage.ts";


function validateFilters(
    filters: MarketplaceFilters,
): void {
    const supportedConditions = [
        "BRAND_NEW",
        "FOREIGN_USED",
        "NIGERIAN_USED",
    ] as const;

    if (
        filters.condition !== undefined
        && !supportedConditions.some(
            (condition) => condition === filters.condition,
        )
    ) {
        throw new Error(
            "Invalid vehicle condition. Use BRAND_NEW, FOREIGN_USED, or NIGERIAN_USED.",
        );
    }

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
 * Fetches listing images separately to avoid
 * duplicating marketplace search results.
 */
async function getMarketplaceImages(
    listingIds: string[],
): Promise<Map<string, MarketplaceImage[]>> {
    const imageMap = new Map<string, MarketplaceImage[]>();

    if (listingIds.length === 0) {
        return imageMap;
    }

    const imageRows = await db
        .select({
            id: listingImages.id,
            listingId: listingImages.listingId,
            objectKey: listingImages.objectKey,
            mimeType: listingImages.mimeType,
            width: listingImages.width,
            height: listingImages.height,
            sortOrder: listingImages.sortOrder,
        })
        .from(listingImages)
        .where(
            inArray(
                listingImages.listingId,
                listingIds,
            ),
        )
        .orderBy(
            asc(listingImages.sortOrder),
        );

    const storage = getObjectStorage();

    for (const image of imageRows) {
        const marketplaceImage: MarketplaceImage = {
            id: image.id,
            objectKey: image.objectKey,
            sortOrder: image.sortOrder,
            mimeType: image.mimeType,
            width: image.width,
            height: image.height,

            url: storage.publicUrl(
                image.objectKey,
                {
                    resourceType: "image",
                    access: "public",
                },
            ),

            thumbnailUrl: storage.transformedImageUrl(
                image.objectKey,
                {
                    width: 600,
                    height: 600,
                    quality: "auto",
                    format: "webp",
                },
            ),

            detailUrl: storage.transformedImageUrl(
                image.objectKey,
                {
                    width: 1600,
                    height: 1600,
                    quality: "auto",
                    format: "webp",
                },
            ),
        };

        const existingImages =
            imageMap.get(image.listingId) ?? [];

        existingImages.push(marketplaceImage);

        imageMap.set(
            image.listingId,
            existingImages,
        );
    }

    return imageMap;
}


/**
 * PostgreSQL-backed marketplace search provider.
 *
 * Supports:
 * - Catalogue-linked listings.
 * - Manually entered vehicle listings.
 * - Optional vehicle catalogue relationships.
 * - Boosted and non-boosted listings.
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

        /*
         * Active boost detection.
         */
        const activeBoostExists = sql<boolean>`
            EXISTS (
                SELECT 1
                FROM listing_boosts AS boost
                WHERE boost.listing_id = ${listings.id}
                AND boost.status = 'ACTIVE'
                AND boost.starts_at IS NOT NULL
                AND boost.starts_at <= ${now}
                AND boost.expires_at IS NOT NULL
                AND boost.expires_at > ${now}
            )
        `;

        /*
         * Base marketplace conditions.
         */
        const conditions: SQL[] = [
            eq(
                listings.status,
                "APPROVED",
            ),

            // KARMASS marketplace inventory is currently Nigeria-only.
            ilike(listings.country, "Nigeria"),

            or(
                isNull(listings.expiresAt),
                gt(
                    listings.expiresAt,
                    now,
                ),
            )!,

            eq(
                users.status,
                "ACTIVE",
            ),
        ];

        /*
         * Featured listings must have an active boost.
         */
        if (filters.boostedOnly) {
            conditions.push(activeBoostExists);
        }

        /*
         * Exclusion is opt-in only.
         *
         * Normal marketplace searches include both
         * boosted and non-boosted listings.
         */
        if (filters.excludeBoosted) {
            conditions.push(
                sql<boolean>`
                    NOT (${activeBoostExists})
                `,
            );
        }

        /*
         * External-provider vehicle filters.
         *
         * Provider values are names, not local catalogue IDs. Match them
         * against the immutable vehicle identity snapshot stored on each
         * listing so API-backed uploads and older catalogue-linked listings
         * are both searchable.
         */
        if (filters.make?.trim()) {
            const pattern = `%${filters.make.trim()}%`;
            conditions.push(
                or(
                    ilike(listings.makeName, pattern),
                    ilike(vehicleMakes.name, pattern),
                )!,
            );
        }

        if (filters.model?.trim()) {
            const pattern = `%${filters.model.trim()}%`;
            conditions.push(
                or(
                    ilike(listings.modelName, pattern),
                    ilike(vehicleModels.name, pattern),
                )!,
            );
        }

        if (filters.variant?.trim()) {
            const pattern = `%${filters.variant.trim()}%`;
            conditions.push(
                or(
                    ilike(listings.variantName, pattern),
                    ilike(vehicleVariants.name, pattern),
                )!,
            );
        }

        /*
         * Legacy catalogue-ID filters remain supported for old saved searches.
         */
        if (filters.makeId) {
            conditions.push(
                eq(
                    vehicleMakes.id,
                    filters.makeId,
                ),
            );
        }

        if (filters.modelId) {
            conditions.push(
                eq(
                    vehicleModels.id,
                    filters.modelId,
                ),
            );
        }

        if (filters.generationId) {
            conditions.push(
                eq(
                    vehicleGenerations.id,
                    filters.generationId,
                ),
            );
        }

        if (filters.variantId) {
            conditions.push(
                eq(
                    vehicleVariants.id,
                    filters.variantId,
                ),
            );
        }

        /*
         * Vehicle condition.
         */
        if (filters.condition) {
            conditions.push(
                eq(
                    listings.condition,
                    filters.condition,
                ),
            );
        }

        /*
         * Location filters.
         */
        if (filters.state?.trim()) {
            const selectedState = filters.state.trim();
            if (selectedState.toLowerCase() === "fct") {
                conditions.push(
                    or(
                        ilike(listings.state, "FCT"),
                        ilike(listings.state, "Abuja"),
                        ilike(listings.state, "Federal Capital Territory"),
                    )!,
                );
            } else {
                conditions.push(
                    or(
                        ilike(listings.state, selectedState),
                        ilike(listings.state, `${selectedState} State`),
                    )!,
                );
            }
        }

        if (filters.city?.trim()) {
            conditions.push(
                ilike(
                    listings.city,
                    `%${filters.city.trim()}%`,
                ),
            );
        }

        /*
         * Price filters.
         */
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

        /*
         * Mileage filters.
         */
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

        /*
         * Year filters.
         *
         * Prefer the seller-editable listing snapshot.
         * Fall back to the catalogue variant year.
         */
        if (filters.minYear !== undefined) {
            conditions.push(
                sql<boolean>`
                    COALESCE(
                        ${listings.year},
                        ${vehicleVariants.year}
                    ) >= ${filters.minYear}
                `,
            );
        }

        if (filters.maxYear !== undefined) {
            conditions.push(
                sql<boolean>`
                    COALESCE(
                        ${listings.year},
                        ${vehicleVariants.year}
                    ) <= ${filters.maxYear}
                `,
            );
        }

        /*
         * Fuel type filter.
         *
         * Catalogue enum values are converted to text
         * so they can be compared with listing snapshots.
         */
        if (filters.fuelType) {
            conditions.push(
                sql<boolean>`
                    UPPER(
                        COALESCE(
                            ${listings.fuelType},
                            ${vehicleVariants.fuelType}::text
                        )
                    ) = ${filters.fuelType}
                `,
            );
        }

        /*
         * Transmission filter.
         */
        if (filters.transmission) {
            conditions.push(
                sql<boolean>`
                    UPPER(
                        COALESCE(
                            ${listings.transmission},
                            ${vehicleVariants.transmission}::text
                        )
                    ) = ${filters.transmission}
                `,
            );
        }

        /*
         * Body style filter.
         */
        if (filters.bodyStyle) {
            conditions.push(
                sql<boolean>`
                    UPPER(
                        COALESCE(
                            ${listings.bodyStyle},
                            ${vehicleVariants.bodyStyle}::text
                        )
                    ) = ${filters.bodyStyle}
                `,
            );
        }

        /*
         * Dealer filters.
         */
        if (filters.dealerOnly) {
            conditions.push(
                eq(
                    users.accountType,
                    "DEALER",
                ),
            );
        }

        if (filters.verifiedDealerOnly) {
            conditions.push(
                eq(
                    users.accountType,
                    "DEALER",
                ),

                eq(
                    dealerProfiles.verified,
                    true,
                ),
            );
        }

        /*
         * Keyword search.
         *
         * Every search term must match at least one
         * searchable field.
         *
         * This allows searches such as:
         * Toyota Camry
         * Mercedes Benz
         * Honda Accord
         * Toyota 2022
         */
        if (filters.q?.trim()) {
            const searchTerms = filters.q
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 8);

            for (const term of searchTerms) {
                const pattern = `%${term}%`;

                conditions.push(
                    or(
                        ilike(
                            listings.title,
                            pattern,
                        ),

                        ilike(
                            listings.description,
                            pattern,
                        ),

                        ilike(
                            listings.makeName,
                            pattern,
                        ),

                        ilike(
                            listings.modelName,
                            pattern,
                        ),

                        ilike(
                            listings.generationName,
                            pattern,
                        ),

                        ilike(
                            listings.variantName,
                            pattern,
                        ),

                        ilike(
                            vehicleMakes.name,
                            pattern,
                        ),

                        ilike(
                            vehicleModels.name,
                            pattern,
                        ),

                        ilike(
                            vehicleGenerations.name,
                            pattern,
                        ),

                        ilike(
                            vehicleVariants.name,
                            pattern,
                        ),

                        sql<boolean>`
                            CAST(
                                ${listings.specifications}
                                AS TEXT
                            ) ILIKE ${pattern}
                        `,
                    )!,
                );
            }
        }

        const whereCondition = and(...conditions);

        /*
         * Active boost priority.
         */
        const activeBoostPriority = sql<number>`
            CASE
                WHEN ${activeBoostExists}
                THEN 100
                ELSE 0
            END
        `;

        /*
         * Shared optional catalogue joins.
         *
         * These are LEFT JOINs because a manual listing
         * may not have any catalogue relationship.
         */

        /*
         * Count matching listings.
         */
        const [countResult] = await db
            .select({
                total: sql<number>`count(*)::int`,
            })
            .from(listings)

            .leftJoin(
                vehicleVariants,
                eq(
                    listings.vehicleVariantId,
                    vehicleVariants.id,
                ),
            )

            .leftJoin(
                vehicleGenerations,
                eq(
                    vehicleVariants.generationId,
                    vehicleGenerations.id,
                ),
            )

            .leftJoin(
                vehicleModels,
                eq(
                    vehicleGenerations.modelId,
                    vehicleModels.id,
                ),
            )

            .leftJoin(
                vehicleMakes,
                eq(
                    vehicleModels.makeId,
                    vehicleMakes.id,
                ),
            )

            .innerJoin(
                users,
                eq(
                    listings.sellerId,
                    users.id,
                ),
            )

            .leftJoin(
                dealerProfiles,
                eq(
                    dealerProfiles.userId,
                    users.id,
                ),
            )

            .where(whereCondition);

        const total = countResult?.total ?? 0;

        const offset = (page - 1) * limit;

        const sort =
            filters.sort
            ?? (filters.q?.trim()
                ? "relevance"
                : "newest");

        const orderBy: SQL[] = [];

        /*
         * Boosted listings receive priority.
         *
         * This does not remove ordinary listings.
         */
        orderBy.push(
            desc(activeBoostPriority),
        );

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
        } else if (
            sort === "relevance"
            && filters.q?.trim()
        ) {
            const pattern = `%${filters.q.trim()}%`;

            const relevanceScore = sql<number>`
                CASE
                    WHEN ${listings.title} ILIKE ${pattern}
                        THEN 10

                    WHEN ${listings.makeName} ILIKE ${pattern}
                        THEN 9

                    WHEN ${vehicleMakes.name} ILIKE ${pattern}
                        THEN 9

                    WHEN ${listings.modelName} ILIKE ${pattern}
                        THEN 8

                    WHEN ${vehicleModels.name} ILIKE ${pattern}
                        THEN 8

                    WHEN ${listings.variantName} ILIKE ${pattern}
                        THEN 7

                    WHEN ${vehicleVariants.name} ILIKE ${pattern}
                        THEN 7

                    WHEN ${listings.generationName} ILIKE ${pattern}
                        THEN 6

                    WHEN ${vehicleGenerations.name} ILIKE ${pattern}
                        THEN 6

                    WHEN ${listings.description} ILIKE ${pattern}
                        THEN 2

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

        /*
         * Fetch listings, optional vehicles,
         * sellers and dealers.
         */
        const results = await db
            .select({
                listing: listings,

                make: vehicleMakes,
                model: vehicleModels,
                generation: vehicleGenerations,
                variant: vehicleVariants,

                seller: {
                    id: users.id,
                    firstName: users.firstName,
                    lastName: users.lastName,
                    accountType: users.accountType,
                    avatarUrl: users.avatarUrl,
                    createdAt: users.createdAt,
                },

                dealer: {
                    companyName: dealerProfiles.companyName,
                    verified: dealerProfiles.verified,
                    verifiedAt: dealerProfiles.verifiedAt,
                },

                boostPriority: activeBoostPriority,
            })
            .from(listings)

            .leftJoin(
                vehicleVariants,
                eq(
                    listings.vehicleVariantId,
                    vehicleVariants.id,
                ),
            )

            .leftJoin(
                vehicleGenerations,
                eq(
                    vehicleVariants.generationId,
                    vehicleGenerations.id,
                ),
            )

            .leftJoin(
                vehicleModels,
                eq(
                    vehicleGenerations.modelId,
                    vehicleModels.id,
                ),
            )

            .leftJoin(
                vehicleMakes,
                eq(
                    vehicleModels.makeId,
                    vehicleMakes.id,
                ),
            )

            .innerJoin(
                users,
                eq(
                    listings.sellerId,
                    users.id,
                ),
            )

            .leftJoin(
                dealerProfiles,
                eq(
                    dealerProfiles.userId,
                    users.id,
                ),
            )

            .where(whereCondition)

            .orderBy(...orderBy)

            .limit(limit)

            .offset(offset);

        /*
         * Fetch images for returned listings.
         */
        const listingIds = results.map(
            (item) => item.listing.id,
        );

        const imagesByListing =
            await getMarketplaceImages(listingIds);

        /*
         * Normalize marketplace response.
         */
        const marketplaceListings = results.map(
            (result) => ({
                listing: result.listing,

                make: result.make,
                model: result.model,
                generation: result.generation,
                variant: result.variant,

                seller: {
                    ...result.seller,

                    displayName: [
                        result.seller.firstName,
                        result.seller.lastName,
                    ]
                        .filter(Boolean)
                        .join(" "),

                    avatarUrl: result.seller.avatarUrl || null,
                },

                dealer: result.dealer?.companyName
                    ? result.dealer
                    : null,

                images:
                    imagesByListing.get(
                        result.listing.id,
                    ) ?? [],

                boostPriority: result.boostPriority,
            }),
        );

        const totalPages = Math.ceil(total / limit);

        return {
            listings: marketplaceListings,

            pagination: {
                page,
                limit,
                total,
                totalPages,

                hasNextPage: page < totalPages,

                hasPreviousPage:
                    page > 1 && total > 0,
            },
        };
    }
}


const postgresMarketplaceSearchProvider =
    new PostgresMarketplaceSearchProvider();


export async function searchMarketplace(
    filters: MarketplaceFilters,
): Promise<MarketplaceSearchResult> {
    return postgresMarketplaceSearchProvider.search(filters);
}

/**
 * Returns distinct cities with currently available marketplace listings
 * for a selected Nigerian state.
 */
export async function getMarketplaceCitiesByState(
    state: string,
): Promise<string[]> {
    const selectedState = state.trim();

    if (!selectedState) {
        return [];
    }

    const now = new Date();

    const stateCondition =
        selectedState.toLowerCase() === "fct"
            ? or(
                  ilike(listings.state, "FCT"),
                  ilike(listings.state, "Abuja"),
                  ilike(
                      listings.state,
                      "Federal Capital Territory",
                  ),
              )
            : or(
                  ilike(listings.state, selectedState),
                  ilike(
                      listings.state,
                      `${selectedState} State`,
                  ),
              );

    const rows = await db
        .selectDistinct({
            city: listings.city,
        })
        .from(listings)
        .innerJoin(
            users,
            eq(listings.sellerId, users.id),
        )
        .where(
            and(
                eq(listings.status, "APPROVED"),
                ilike(listings.country, "Nigeria"),
                eq(users.status, "ACTIVE"),

                isNull(listings.expiresAt),
            )
        );

    // The query above is intentionally not used for the final
    // result because active listings may also have future expiry dates.
    // Apply the complete conditions below.
    const availableCities = await db
        .selectDistinct({
            city: listings.city,
        })
        .from(listings)
        .innerJoin(
            users,
            eq(listings.sellerId, users.id),
        )
        .where(
            and(
                eq(listings.status, "APPROVED"),
                ilike(listings.country, "Nigeria"),
                eq(users.status, "ACTIVE"),
                stateCondition!,
                or(
                    isNull(listings.expiresAt),
                    gt(listings.expiresAt, now),
                )!,
                sql`${listings.city} IS NOT NULL`,
                sql`TRIM(${listings.city}) <> ''`,
            ),
        )
        .orderBy(asc(listings.city));

    return availableCities
        .map((row) => row.city?.trim())
        .filter((city): city is string => Boolean(city));
}


/**
 * Fetch exclusively currently boosted marketplace listings.
 *
 * A listing is featured only while its boost is ACTIVE
 * and within its approved start/end window.
 */
export async function getFeaturedMarketplaceListings(
    page = 1,
    limit = 12,
): Promise<MarketplaceSearchResult> {
    return postgresMarketplaceSearchProvider.search({
        page,
        limit,
        boostedOnly: true,
        sort: "newest",
    });
}