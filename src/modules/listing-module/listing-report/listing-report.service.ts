import {
    and,
    eq,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    listingReports,
    listings,
} from "../../../database/schema/index.ts";

import type {
    z,
} from "zod";

import type {
    createListingReportSchema,
} from "./listing-report.validation.ts";

export type CreateListingReportInput = z.infer<
    typeof createListingReportSchema
>;

export async function createListingReport(
    listingId: string,
    reporterId: string,
    input: CreateListingReportInput,
) {
    const listingResult = await db
        .select({
            id: listings.id,
            sellerId: listings.sellerId,
            status: listings.status,
            expiresAt: listings.expiresAt,
        })
        .from(listings)
        .where(
            eq(
                listings.id,
                listingId,
            ),
        )
        .limit(1);

    const listing = listingResult[0];

    if (!listing) {
        throw new Error(
            "Listing not found.",
        );
    }

    if (listing.sellerId === reporterId) {
        throw new Error(
            "You cannot report your own listing.",
        );
    }

    if (
        listing.status !== "APPROVED"
    ) {
        throw new Error(
            "Only active marketplace listings can be reported.",
        );
    }

    if (
        listing.expiresAt !== null &&
        listing.expiresAt <= new Date()
    ) {
        throw new Error(
            "This listing has expired and cannot be reported.",
        );
    }

    const existing = await db
        .select({
            id: listingReports.id,
            status: listingReports.status,
        })
        .from(listingReports)
        .where(
            and(
                eq(
                    listingReports.listingId,
                    listingId,
                ),
                eq(
                    listingReports.reporterId,
                    reporterId,
                ),
            ),
        )
        .limit(1);

    if (existing[0]) {
        throw new Error(
            "You have already reported this listing.",
        );
    }

    const details =
        input.details?.trim();

    const inserted = await db
        .insert(listingReports)
        .values({
            listingId,
            reporterId,
            reason: input.reason,
            ...(details
                ? {
                      details,
                  }
                : {}),
        })
        .returning({
            id: listingReports.id,
            listingId:
                listingReports.listingId,
            reason:
                listingReports.reason,
            status:
                listingReports.status,
            createdAt:
                listingReports.createdAt,
        });

    const report = inserted[0];

    if (!report) {
        throw new Error(
            "Unable to create listing report.",
        );
    }

    return report;
}