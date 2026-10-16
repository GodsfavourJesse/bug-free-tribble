import { and, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";

import { db } from "../../../database/index.ts";
import {
    listingViews,
    listings,
} from "../../../database/schema/index.ts";

export interface RecordListingViewInput {
    listingId: string;
    viewerId?: string;
    viewerKey: string;
}

function createViewerKey(value: string): string {
    return createHash("sha256")
        .update(value)
        .digest("hex");
}

export function createAuthenticatedViewerKey(
    userId: string,
): string {
    return createViewerKey(`user:${userId}`);
}

export function createAnonymousViewerKey(
    sessionId: string,
): string {
    return createViewerKey(`session:${sessionId}`);
}

function getToday(): string {
    return new Date().toISOString().slice(0, 10);
}

export async function recordListingView(
    input: RecordListingViewInput,
): Promise<boolean> {
    return db.transaction(async (tx) => {
        const listingResult = await tx
            .select({
                id: listings.id,
                sellerId: listings.sellerId,
                status: listings.status,
                expiresAt: listings.expiresAt,
            })
            .from(listings)
            .where(eq(listings.id, input.listingId))
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

        if (
            input.viewerId &&
            input.viewerId === listing.sellerId
        ) {
            return false;
        }

        const viewedDate = getToday();

        const existingView = await tx
            .select({
                id: listingViews.id,
            })
            .from(listingViews)
            .where(
                and(
                    eq(
                        listingViews.listingId,
                        input.listingId,
                    ),
                    eq(
                        listingViews.viewerKey,
                        input.viewerKey,
                    ),
                    eq(
                        listingViews.viewedDate,
                        viewedDate,
                    ),
                ),
            )
            .limit(1);

        if (existingView[0]) {
            return false;
        }

        await tx.insert(listingViews).values({
            listingId: input.listingId,
            viewerId: input.viewerId ?? null,
            viewerKey: input.viewerKey,
            viewedDate,
        });

        await tx
            .update(listings)
            .set({
                viewCount: sql`${listings.viewCount} + 1`,
                updatedAt: new Date(),
            })
            .where(eq(listings.id, input.listingId));

        return true;
    });
}