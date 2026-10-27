import {
    and,
    desc,
    eq,
    ilike,
    or,
    sql,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    dealerProfiles,
    users,
} from "../../../database/schema/index.ts";

export interface PublicDealerDirectoryQuery {
    search?: string;
    page: number;
    limit: number;
}

export async function getPublicDealers(
    query: PublicDealerDirectoryQuery,
) {
    const page = query.page;
    const limit = query.limit;

    const search = query.search
        ?.trim()
        .slice(0, 100);

    const offset = (page - 1) * limit;

    /*
    * This condition is enforced by PostgreSQL.
    *
    * Unverified profiles are never returned by this endpoint,
    * regardless of what the frontend requests.
    */
    const conditions = [
        eq(dealerProfiles.verified, true),
        eq(users.accountType, "DEALER"),
    ];

    if (search) {
        conditions.push(
            or(
                ilike(
                    dealerProfiles.companyName,
                    `%${search}%`,
                ),
                ilike(
                    dealerProfiles.bio,
                    `%${search}%`,
                ),
            )!,
        );
    }

    const whereCondition = and(...conditions);

    const [dealers, countResult] = await Promise.all([
        db
            .select({
                id: dealerProfiles.id,
                userId: dealerProfiles.userId,
                companyName: dealerProfiles.companyName,
                verified: dealerProfiles.verified,
                verifiedAt: dealerProfiles.verifiedAt,
                bio: dealerProfiles.bio,
                profilePictureUrl:
                    dealerProfiles.profilePictureUrl,
                coverPhotoUrl:
                    dealerProfiles.coverPhotoUrl,
                createdAt: dealerProfiles.createdAt,
            })
            .from(dealerProfiles)
            .innerJoin(
                users,
                eq(
                    dealerProfiles.userId,
                    users.id,
                ),
            )
            .where(whereCondition)
            .orderBy(
                desc(dealerProfiles.verifiedAt),
                desc(dealerProfiles.createdAt),
            )
            .limit(limit)
            .offset(offset),

        db
            .select({
                count: sql<number>`count(*)::int`,
            })
            .from(dealerProfiles)
            .innerJoin(
                users,
                eq(
                    dealerProfiles.userId,
                    users.id,
                ),
            )
            .where(whereCondition),
    ]);

    const total = countResult[0]?.count ?? 0;
    const totalPages = Math.ceil(total / limit);

    return {
        items: dealers,
        pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
        },
    };

}
