import {
    and,
    asc,
    eq,
    gt,
    isNull,
    or,
    sql,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    dealerProfiles,
    listingImages,
    listings,
    users,
    vehicleGenerations,
    vehicleMakes,
    vehicleModels,
    vehicleVariants,
} from "../../../database/schema/index.ts";

import {
    listingBoosts,
} from "../../../database/schema/boosts.ts";

import {
    getObjectStorage,
} from "../../../infrastructure/storage/object-storage.ts";

export async function getMarketplaceListingDetails(
    listingId: string,
) {
    const now = new Date();

    const [result] = await db
        .select({
            listing: {
                id: listings.id,
                sellerId: listings.sellerId,
                vehicleVariantId:
                    listings.vehicleVariantId,
                title: listings.title,
                description: listings.description,
                price: listings.price,
                currency: listings.currency,
                mileage: listings.mileage,
                condition: listings.condition,
                country: listings.country,
                state: listings.state,
                city: listings.city,
                status: listings.status,
                viewCount: listings.viewCount,
                publishedAt: listings.publishedAt,
                createdAt: listings.createdAt,
                expiresAt: listings.expiresAt,
            },

            seller: {
                id: users.id,
                firstName: users.firstName,
                lastName: users.lastName,
                accountType: users.accountType,
                avatarUrl: users.avatarUrl,
                createdAt: users.createdAt,
            },

            dealer: {
                companyName:
                    dealerProfiles.companyName,
                verified: dealerProfiles.verified,
                verifiedAt:
                    dealerProfiles.verifiedAt,
            },

            make: {
                id: vehicleMakes.id,
                name: vehicleMakes.name,
            },

            model: {
                id: vehicleModels.id,
                name: vehicleModels.name,
            },

            generation: {
                id: vehicleGenerations.id,
                name: vehicleGenerations.name,
            },

            variant: {
                id: vehicleVariants.id,
                name: vehicleVariants.name,
                year: vehicleVariants.year,
                engineName:
                    vehicleVariants.engineName,
                engineDisplacementCc:
                    vehicleVariants.engineDisplacementCc,
                cylinders:
                    vehicleVariants.cylinders,
                horsepower:
                    vehicleVariants.horsepower,
                fuelType:
                    vehicleVariants.fuelType,
                transmission:
                    vehicleVariants.transmission,
                driveType:
                    vehicleVariants.driveType,
                bodyStyle:
                    vehicleVariants.bodyStyle,
                seats: vehicleVariants.seats,
                doors: vehicleVariants.doors,
            },

            isBoosted: sql<boolean>`
                EXISTS (
                    SELECT 1
                    FROM listing_boosts
                    WHERE listing_boosts.listing_id =
                        ${listings.id}
                    AND listing_boosts.status = 'ACTIVE'
                    AND listing_boosts.starts_at <= ${now}
                    AND listing_boosts.expires_at > ${now}
                )
            `,
        })
        .from(listings)
        .innerJoin(
            users,
            eq(
                listings.sellerId,
                users.id,
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
        .leftJoin(
            dealerProfiles,
            eq(
                dealerProfiles.userId,
                users.id,
            ),
        )
        .where(
            and(
                eq(
                    listings.id,
                    listingId,
                ),
                eq(
                    listings.status,
                    "APPROVED",
                ),
                or(
                    isNull(listings.expiresAt),
                    gt(
                        listings.expiresAt,
                        now,
                    ),
                ),
                eq(
                    users.status,
                    "ACTIVE",
                ),
            ),
        )
        .limit(1);

    if (!result) {
        return null;
    }

    const imageRows = await db
        .select({
            id: listingImages.id,
            objectKey: listingImages.objectKey,
            mimeType: listingImages.mimeType,
            width: listingImages.width,
            height: listingImages.height,
            sortOrder: listingImages.sortOrder,
        })
        .from(listingImages)
        .where(
            eq(
                listingImages.listingId,
                listingId,
            ),
        )
        .orderBy(
            asc(listingImages.sortOrder),
        );

    const storage = getObjectStorage();

    const images = imageRows.map((image) => ({
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
        thumbnailUrl:
            storage.transformedImageUrl(
                image.objectKey,
                {
                    width: 600,
                    height: 600,
                    fit: "fit",
                    quality: "auto",
                    format: "webp",
                },
            ),
        detailUrl:
            storage.transformedImageUrl(
                image.objectKey,
                {
                    width: 1600,
                    height: 1600,
                    fit: "limit",
                    quality: "auto",
                    format: "webp",
                },
            ),
    }));

    return {
        ...result,

        seller: {
            ...result.seller,
            displayName: [
                result.seller.firstName,
                result.seller.lastName,
            ].join(" "),
        },

        dealer: result.dealer?.companyName
            ? result.dealer
            : null,

        images,
    };
}