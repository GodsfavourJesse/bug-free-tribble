import {
    and,
    count,
    desc,
    eq,
    gt,
    isNull,
    or,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    dealerProfiles,
    listings,
    userPrivacySettings,
    users,
    vehicleGenerations,
    vehicleMakes,
    vehicleModels,
    vehicleVariants,
} from "../../../database/schema/index.ts";


/**
 * Resolves a publicly discoverable dealer using either:
 *
 * - dealerProfiles.id
 * - dealerProfiles.userId
 *
 * Only verified dealer accounts are discoverable.
 */
async function findPublicDealer(
    dealerId: string,
) {
    const normalizedDealerId = dealerId.trim();

    const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(normalizedDealerId)) {
        throw new Error("Invalid dealer ID.");
    }

    const [dealer] = await db
        .select({
            id: dealerProfiles.id,
            userId: dealerProfiles.userId,
            companyName: dealerProfiles.companyName,
            verified: dealerProfiles.verified,
            verifiedAt: dealerProfiles.verifiedAt,
            createdAt: dealerProfiles.createdAt,

            // Public storefront customization.
            bio: dealerProfiles.bio,
            profilePictureUrl: dealerProfiles.profilePictureUrl,
            coverPhotoUrl: dealerProfiles.coverPhotoUrl,

            // Account information.
            firstName: users.firstName,
            lastName: users.lastName,

            // Phone is selected internally.
            // It will only be returned publicly when permitted.
            phone: users.phone,

            // Public phone visibility preference.
            showPhone: userPrivacySettings.showPhone,
        })
        .from(dealerProfiles)
        .innerJoin(
            users,
            eq(
                dealerProfiles.userId,
                users.id,
            ),
        )
        .leftJoin(
            userPrivacySettings,
            eq(
                userPrivacySettings.userId,
                users.id,
            ),
        )
        .where(
            and(
                or(
                    eq(
                        dealerProfiles.id,
                        normalizedDealerId,
                    ),
                    eq(
                        dealerProfiles.userId,
                        normalizedDealerId,
                    ),
                ),
                eq(
                    dealerProfiles.verified,
                    true,
                ),
                eq(
                    users.accountType,
                    "DEALER",
                ),
                eq(
                    users.status,
                    "ACTIVE",
                ),
            ),
        )
        .limit(1);

    return dealer ?? null;
}

/**
 * Retrieves a public dealer profile.
 *
 * Accepts either the dealer profile ID or dealer user ID.
 *
 * A phone number is returned only when:
 * - The account is an active dealer.
 * - The dealer profile is verified.
 * - The dealer has enabled showPhone.
 *
 * Private application information and verification documents
 * are never included in the response.
 */
export async function getPublicDealerProfile(
    dealerId: string,
) {
    const profile = await findPublicDealer(
        dealerId,
    );

    if (!profile) {
        return null;
    }

    const canShowPhone =
        profile.verified === true &&
        profile.showPhone === true;

    return {
        id: profile.id,
        userId: profile.userId,
        companyName: profile.companyName,
        verified: profile.verified,
        verifiedAt: profile.verifiedAt,
        createdAt: profile.createdAt,

        bio: profile.bio,
        profilePictureUrl: profile.profilePictureUrl,
        coverPhotoUrl: profile.coverPhotoUrl,

        contactName: [
            profile.firstName,
            profile.lastName,
        ]
            .filter(Boolean)
            .join(" "),

        // Never expose the phone number unless permitted.
        phone: canShowPhone
            ? profile.phone
            : null,

        showPhone: canShowPhone,
    };
}


/**
 * Retrieves a dealer's public, approved marketplace listings.
 *
 * Accepts either the dealer profile ID or dealer user ID.
 *
 * Draft, pending, rejected, suspended, deleted, sold, and
 * expired listings are excluded.
 */
export async function getPublicDealerListings(
    dealerId: string,
    options?: {
        page?: number;
        limit?: number;
    },
) {
    const page = Math.max(
        Math.floor(options?.page ?? 1),
        1,
    );

    const limit = Math.min(
        Math.max(
            Math.floor(options?.limit ?? 20),
            1,
        ),
        100,
    );

    const offset = (page - 1) * limit;

    const emptyResult = {
        items: [],
        pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: page > 1,
        },
    };

    // Resolve profile ID or user ID to the actual dealer.
    const dealer = await findPublicDealer(
        dealerId,
    );

    if (!dealer) {
        return emptyResult;
    }

    const now = new Date();

    const visibilityCondition = or(
        isNull(listings.expiresAt),
        gt(
            listings.expiresAt,
            now,
        ),
    );

    const conditions = [
        eq(
            listings.sellerId,
            dealer.userId,
        ),
        eq(
            listings.status,
            "APPROVED",
        ),
        visibilityCondition!,
    ];

    const rows = await db
        .select({
            id: listings.id,
            title: listings.title,
            description: listings.description,
            price: listings.price,
            currency: listings.currency,
            mileage: listings.mileage,
            condition: listings.condition,
            country: listings.country,
            state: listings.state,
            city: listings.city,
            publishedAt: listings.publishedAt,
            createdAt: listings.createdAt,

            vehicleVariant: {
                id: vehicleVariants.id,
                name: vehicleVariants.name,
            },

            vehicleGeneration: {
                id: vehicleGenerations.id,
                name: vehicleGenerations.name,
            },

            vehicleModel: {
                id: vehicleModels.id,
                name: vehicleModels.name,
            },

            vehicleMake: {
                id: vehicleMakes.id,
                name: vehicleMakes.name,
            },
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
            and(...conditions),
        )
        .orderBy(
            desc(listings.publishedAt),
            desc(listings.createdAt),
        )
        .limit(limit)
        .offset(offset);

    const [totalResult] = await db
        .select({
            count: count(),
        })
        .from(listings)
        .where(
            and(...conditions),
        );

    const total = Number(
        totalResult?.count ?? 0,
    );

    return {
        items: rows,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(
                total / limit,
            ),
            hasNextPage: page * limit < total,
            hasPreviousPage: page > 1,
        },
    };
}
