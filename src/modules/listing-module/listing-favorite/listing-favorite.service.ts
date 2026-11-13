import {
    and,
    count,
    desc,
    eq,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";
import { AppError } from "../../../errors/app-error.ts";

import {
    listingFavorites,
    listings,
    vehicleGenerations,
    vehicleMakes,
    vehicleModels,
    vehicleVariants,
} from "../../../database/schema/index.ts";

export interface GetUserFavoritesOptions {
    userId: string;
    page?: number;
    limit?: number;
}

export async function addListingFavorite(
    listingId: string,
    userId: string,
) {
    const listingResult = await db
        .select({
            id: listings.id,
            sellerId: listings.sellerId,
            status: listings.status,
            expiresAt: listings.expiresAt,
        })
        .from(listings)
        .where(eq(listings.id, listingId))
        .limit(1);

    const listing = listingResult[0];

    if (!listing) {
        throw new AppError(
            "Listing not found.",
            404,
            "LISTING_NOT_FOUND",
        );
    }

    if (listing.sellerId === userId) {
        throw new AppError(
            "You cannot favorite your own listing.",
            403,
            "OWN_LISTING_FAVORITE_NOT_ALLOWED",
        );
    }

    if (listing.status !== "APPROVED") {
        throw new AppError(
            "Only active marketplace listings can be favorited.",
            409,
            "LISTING_NOT_AVAILABLE",
        );
    }

    if (
        listing.expiresAt !== null &&
        listing.expiresAt <= new Date()
    ) {
        throw new AppError(
            "This listing has expired and cannot be favorited.",
            410,
            "LISTING_EXPIRED",
        );
    }

    const existing = await db
        .select({
            id: listingFavorites.id,
        })
        .from(listingFavorites)
        .where(
            and(
                eq(
                    listingFavorites.listingId,
                    listingId,
                ),
                eq(
                    listingFavorites.userId,
                    userId,
                ),
            ),
        )
        .limit(1);

    if (existing[0]) {
        return {
            favorited: true,
            alreadyExists: true,
        };
    }

    const inserted = await db
        .insert(listingFavorites)
        .values({
            listingId,
            userId,
        })
        .onConflictDoNothing({
            target: [
                listingFavorites.userId,
                listingFavorites.listingId,
            ],
        })
        .returning({ id: listingFavorites.id });

    if (inserted.length === 0) {
        return {
            favorited: true,
            alreadyExists: true,
        };
    }

    return {
        favorited: true,
        alreadyExists: false,
    };
}

export async function removeListingFavorite(
    listingId: string,
    userId: string,
): Promise<boolean> {
    const deleted = await db
        .delete(listingFavorites)
        .where(
            and(
                eq(
                    listingFavorites.listingId,
                    listingId,
                ),
                eq(
                    listingFavorites.userId,
                    userId,
                ),
            ),
        )
        .returning({
            id: listingFavorites.id,
        });

    return Boolean(deleted[0]);
}

export async function isListingFavorited(
    listingId: string,
    userId: string,
): Promise<boolean> {
    const result = await db
        .select({
            id: listingFavorites.id,
        })
        .from(listingFavorites)
        .where(
            and(
                eq(
                    listingFavorites.listingId,
                    listingId,
                ),
                eq(
                    listingFavorites.userId,
                    userId,
                ),
            ),
        )
        .limit(1);

    return Boolean(result[0]);
}

export async function getUserFavorites(
    options: GetUserFavoritesOptions,
) {
    const page =
        options.page !== undefined &&
        Number.isInteger(options.page) &&
        options.page > 0
            ? options.page
            : 1;

    const limit =
        options.limit !== undefined &&
        Number.isInteger(options.limit) &&
        options.limit > 0
            ? Math.min(options.limit, 100)
            : 20;

    const offset = (page - 1) * limit;

    const [items, totalResult] =
        await Promise.all([
            db
                .select({
                    favorite: listingFavorites,
                    listing: listings,
                    variant: vehicleVariants,
                    generation: vehicleGenerations,
                    model: vehicleModels,
                    make: vehicleMakes,
                })
                .from(listingFavorites)
                .innerJoin(
                    listings,
                    eq(
                        listingFavorites.listingId,
                        listings.id,
                    ),
                )
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
                .where(
                    eq(
                        listingFavorites.userId,
                        options.userId,
                    ),
                )
                .orderBy(
                    desc(
                        listingFavorites.createdAt,
                    ),
                )
                .limit(limit)
                .offset(offset),

            db
                .select({
                    count: count(),
                })
                .from(listingFavorites)
                .where(
                    eq(
                        listingFavorites.userId,
                        options.userId,
                    ),
                ),
        ]);

    const total = Number(
        totalResult[0]?.count ?? 0,
    );

    return {
        items,
        pagination: {
            page,
            limit,
            total,
            totalPages:
                total === 0
                    ? 0
                    : Math.ceil(total / limit),
            hasNextPage:
                page * limit < total,
            hasPreviousPage:
                page > 1,
        },
    };
}
