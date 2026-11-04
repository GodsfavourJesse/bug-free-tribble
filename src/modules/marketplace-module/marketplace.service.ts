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

import {
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

        const conditions = [
            eq(listings.status, "APPROVED"),

            or(
                isNull(listings.expiresAt),
                gt(listings.expiresAt, now),
            )!,
        ];

        /*
        * Featured listings must have a currently active boost.
        */
        if (filters.boostedOnly) {
            conditions.push(activeBoostExists);
        }

        /*
        * Ordinary homepage listings must not have a currently
        * active boost.
        */
        if (filters.excludeBoosted) {
            conditions.push(
                sql<boolean>`NOT (${activeBoostExists})`,
            );
        }

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
         * Count matching listings.
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

        /*
         * Fetch listings, vehicles, sellers and dealers.
         *
         * Profile picture is fetched through users.avatarUrl.
         * If the user has no profile picture, avatarUrl is null.
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

        /*
         * Fetch all images for the returned listings.
         */
        const listingIds = results.map(
            (item) => item.listing.id,
        );

        const imagesByListing =
            await getMarketplaceImages(listingIds);

        /*
         * Normalize the marketplace response.
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
                hasPreviousPage: page > 1 && total > 0,
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