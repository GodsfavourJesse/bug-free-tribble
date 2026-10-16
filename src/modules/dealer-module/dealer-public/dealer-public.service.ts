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
    users,
    vehicleGenerations,
    vehicleMakes,
    vehicleModels,
    vehicleVariants,
} from "../../../database/schema/index.ts";

/**
 * Retrieves a public dealer profile.
 *
 * Only verified dealer profiles are publicly discoverable.
 * Private application information and verification documents
 * are never included in the response.
 */
export async function getPublicDealerProfile(
    dealerUserId: string,
) {
    const normalizedUserId = dealerUserId.trim();

    const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(normalizedUserId)) {
        throw new Error("Invalid dealer ID.");
    }

    const [profile] = await db
        .select({
            id: dealerProfiles.id,
            userId: dealerProfiles.userId,
            companyName: dealerProfiles.companyName,
            verified: dealerProfiles.verified,
            verifiedAt: dealerProfiles.verifiedAt,
            createdAt: dealerProfiles.createdAt,
            firstName: users.firstName,
            lastName: users.lastName,
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

    if (!profile) {
        return null;
    }

    return {
        id: profile.id,
        userId: profile.userId,
        companyName: profile.companyName,
        verified: profile.verified,
        verifiedAt: profile.verifiedAt,
        createdAt: profile.createdAt,
        contactName: [
            profile.firstName,
            profile.lastName,
        ]
            .filter(Boolean)
            .join(" "),
    };
}

/**
 * Retrieves a dealer's public, approved marketplace listings.
 *
 * Draft, pending, rejected, suspended, deleted, sold, and
 * expired listings are excluded.
 */
export async function getPublicDealerListings(
    dealerUserId: string,
    options?: {
        page?: number;
        limit?: number;
    },
) {
    const normalizedUserId = dealerUserId.trim();

    const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(normalizedUserId)) {
        throw new Error("Invalid dealer ID.");
    }

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
    const now = new Date();

    /*
     * Verify the dealer is currently verified.
     * This also prevents public listing access through
     * this endpoint if the dealer profile is unverified.
     */
    const [profile] = await db
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

    if (!profile) {
        return {
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
    }

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
            normalizedUserId,
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
