import {
    and,
    desc,
    eq,
    gt,
    isNull,
    or,
    sql,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    listingFavorites,
    listings,
    vehicleGenerations,
    vehicleMakes,
    vehicleModels,
    vehicleVariants,
} from "../../../database/schema/index.ts";

export interface FavoritePagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
}

export interface FavoriteListResult {
    favorites: Array<{
        favorite: typeof listingFavorites.$inferSelect;
        listing: typeof listings.$inferSelect;
        make: typeof vehicleMakes.$inferSelect;
        model: typeof vehicleModels.$inferSelect;
        generation: typeof vehicleGenerations.$inferSelect;
        variant: typeof vehicleVariants.$inferSelect;
    }>;
    pagination: FavoritePagination;
}

/**
 * Adds a listing to a user's favorites.
 *
 * Only approved, currently available listings can be added.
 * ON CONFLICT DO NOTHING makes the operation idempotent.
 */
export async function addFavorite(
    userId: string,
    listingId: string,
): Promise<typeof listingFavorites.$inferSelect | null> {
    const now = new Date();

    const [availableListing] = await db
        .select({
            id: listings.id,
        })
        .from(listings)
        .where(
            and(
                eq(listings.id, listingId),
                eq(listings.status, "APPROVED"),
                or(
                    isNull(listings.expiresAt),
                    gt(listings.expiresAt, now),
                )!,
            ),
        )
        .limit(1);

    if (!availableListing) {
        return null;
    }

    const [favorite] = await db
        .insert(listingFavorites)
        .values({
            userId,
            listingId,
        })
        .onConflictDoNothing({
            target: [
                listingFavorites.userId,
                listingFavorites.listingId,
            ],
        })
        .returning();

    if (favorite) {
        return favorite;
    }

    /*
     * The favorite already exists.
     * Return the existing row to keep POST idempotent.
     */
    const [existingFavorite] = await db
        .select()
        .from(listingFavorites)
        .where(
            and(
                eq(listingFavorites.userId, userId),
                eq(listingFavorites.listingId, listingId),
            ),
        )
        .limit(1);

    return existingFavorite ?? null;
}

/**
 * Removes a favorite.
 *
 * This also allows users to remove favorites whose listings
 * have expired or have been removed from the marketplace.
 */
export async function removeFavorite(
    userId: string,
    listingId: string,
): Promise<boolean> {
    const deleted = await db
        .delete(listingFavorites)
        .where(
            and(
                eq(listingFavorites.userId, userId),
                eq(listingFavorites.listingId, listingId),
            ),
        )
        .returning({
            id: listingFavorites.id,
        });

    return deleted.length > 0;
}

/**
 * Checks whether a listing is in a user's favorites.
 */
export async function isFavorite(
    userId: string,
    listingId: string,
): Promise<boolean> {
    const [favorite] = await db
        .select({
            id: listingFavorites.id,
        })
        .from(listingFavorites)
        .where(
            and(
                eq(listingFavorites.userId, userId),
                eq(listingFavorites.listingId, listingId),
            ),
        )
        .limit(1);

    return favorite !== undefined;
}

/**
 * Returns the authenticated user's favorites.
 *
 * Expired, rejected, suspended, sold, or otherwise unavailable
 * listings are excluded from the returned list. Their favorite
 * records are not deleted automatically.
 */
export async function listFavorites(
    userId: string,
    requestedPage = 1,
    requestedLimit = 20,
): Promise<FavoriteListResult> {
    const page =
        Number.isInteger(requestedPage)
        && requestedPage >= 1
            ? requestedPage
            : 1;

    const limit =
        Number.isInteger(requestedLimit)
        && requestedLimit >= 1
        && requestedLimit <= 50
            ? requestedLimit
            : 20;

    const now = new Date();

    const conditions = [
        eq(listingFavorites.userId, userId),
        eq(listings.status, "APPROVED"),
        or(
            isNull(listings.expiresAt),
            gt(listings.expiresAt, now),
        )!,
    ];

    const whereCondition = and(...conditions);

    const [countResult] = await db
        .select({
            total: sql<number>`count(*)::int`,
        })
        .from(listingFavorites)
        .innerJoin(
            listings,
            eq(
                listingFavorites.listingId,
                listings.id,
            ),
        )
        .where(whereCondition);

    const total = countResult?.total ?? 0;
    const offset = (page - 1) * limit;

    const results = await db
        .select({
            favorite: listingFavorites,
            listing: listings,
            make: vehicleMakes,
            model: vehicleModels,
            generation: vehicleGenerations,
            variant: vehicleVariants,
        })
        .from(listingFavorites)
        .innerJoin(
            listings,
            eq(
                listingFavorites.listingId,
                listings.id,
            ),
        )
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
        .where(whereCondition)
        .orderBy(
            desc(listingFavorites.createdAt),
            desc(listingFavorites.id),
        )
        .limit(limit)
        .offset(offset);

    const totalPages = Math.ceil(total / limit);

    return {
        favorites: results,
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