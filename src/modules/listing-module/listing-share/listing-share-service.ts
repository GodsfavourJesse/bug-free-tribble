import { eq } from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    listingShares,
    listings,
} from "../../../database/schema/index.ts";

export type ListingSharePlatform =
    | "WHATSAPP"
    | "FACEBOOK"
    | "X"
    | "COPY_LINK"
    | "OTHER";

export interface RecordListingShareInput {
    listingId: string;
    userId?: string;
    platform: ListingSharePlatform;
}

export async function recordListingShare(
    input: RecordListingShareInput,
): Promise<boolean> {
    const listingResult = await db
        .select({
            id: listings.id,
            status: listings.status,
            expiresAt: listings.expiresAt,
        })
        .from(listings)
        .where(
            eq(
                listings.id,
                input.listingId,
            ),
        )
        .limit(1);

    const listing = listingResult[0];

    if (!listing) {
        return false;
    }

    if (listing.status !== "APPROVED") {
        return false;
    }

    if (
        listing.expiresAt !== null &&
        listing.expiresAt <= new Date()
    ) {
        return false;
    }

    await db
        .insert(listingShares)
        .values({
            listingId: input.listingId,
            platform: input.platform,
            ...(input.userId !== undefined
                ? {
                      userId: input.userId,
                  }
                : {}),
        });

    return true;
}