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
    listingReports,
    listings,
    users,
} from "../../../database/schema/index.ts";

import { AppError } from "../../../errors/app-error.ts";
import { writeAudit } from "../admin.service.ts";

const LISTING_STATUSES = [
    "DRAFT",
    "PENDING_REVIEW",
    "APPROVED",
    "REJECTED",
    "EXPIRED",
    "SOLD",
    "SUSPENDED",
    "DELETED",
] as const;

type ListingStatus = typeof LISTING_STATUSES[number];

export async function listAdminListings(input: {
    status?: ListingStatus;
    search?: string;
    page: number;
    limit: number;
}) {
    const filters = [];

    if (input.status) {
        filters.push(eq(listings.status, input.status));
    }

    if (input.search) {
        const pattern = `%${input.search}%`;
        filters.push(or(
            ilike(listings.title, pattern),
            ilike(listings.description, pattern),
            ilike(listings.city, pattern),
            ilike(listings.state, pattern),
        )!);
    }

    const where = filters.length ? and(...filters) : undefined;
    const offset = (input.page - 1) * input.limit;

    const [rows, countRows] = await Promise.all([
        db.select({
            listing: listings,
            seller: {
                id: users.id,
                email: users.email,
                firstName: users.firstName,
                lastName: users.lastName,
                accountType: users.accountType,
                status: users.status,
            },
        })
            .from(listings)
            .innerJoin(users, eq(users.id, listings.sellerId))
            .where(where)
            .orderBy(desc(listings.createdAt))
            .limit(input.limit)
            .offset(offset),
        db.select({ count: sql<number>`count(*)::int` })
            .from(listings)
            .where(where),
    ]);

    const total = Number(countRows[0]?.count ?? 0);

    return {
        items: rows,
        pagination: {
            page: input.page,
            limit: input.limit,
            total,
            totalPages: Math.ceil(total / input.limit),
        },
    };
}

export async function listAdminListingReports(input: {
    status?: "PENDING" | "REVIEWING" | "RESOLVED" | "DISMISSED";
    page: number;
    limit: number;
}) {
    const where = input.status
        ? eq(listingReports.status, input.status)
        : undefined;
    const offset = (input.page - 1) * input.limit;

    const [rows, countRows] = await Promise.all([
        db.select({
            report: listingReports,
            listing: {
                id: listings.id,
                title: listings.title,
                status: listings.status,
                price: listings.price,
                sellerId: listings.sellerId,
            },
            reporter: {
                id: users.id,
                email: users.email,
                firstName: users.firstName,
                lastName: users.lastName,
            },
        })
            .from(listingReports)
            .innerJoin(listings, eq(listings.id, listingReports.listingId))
            .innerJoin(users, eq(users.id, listingReports.reporterId))
            .where(where)
            .orderBy(desc(listingReports.createdAt))
            .limit(input.limit)
            .offset(offset),
        db.select({ count: sql<number>`count(*)::int` })
            .from(listingReports)
            .where(where),
    ]);

    const total = Number(countRows[0]?.count ?? 0);

    return {
        items: rows,
        pagination: {
            page: input.page,
            limit: input.limit,
            total,
            totalPages: Math.ceil(total / input.limit),
        },
    };
}

export async function resolveAdminListingReport(input: {
    reportId: string;
    adminId: string;
    decision: "RESOLVED" | "DISMISSED";
    resolutionNote?: string;
    ipAddress?: string;
    userAgent?: string;
}) {
    return db.transaction(async (tx) => {
        const reportRows = await tx.select()
            .from(listingReports)
            .where(eq(listingReports.id, input.reportId))
            .for("update")
            .limit(1);

        const report = reportRows[0];

        if (!report) {
            throw new AppError("Listing report not found.", 404, "LISTING_REPORT_NOT_FOUND");
        }

        if (report.status === "RESOLVED" || report.status === "DISMISSED") {
            throw new AppError("Listing report has already been resolved.", 409, "LISTING_REPORT_ALREADY_RESOLVED");
        }

        const now = new Date();
        const updatedRows = await tx.update(listingReports)
            .set({
                status: input.decision,
                resolutionNote: input.resolutionNote ?? null,
                resolvedBy: input.adminId,
                resolvedAt: now,
                updatedAt: now,
            })
            .where(eq(listingReports.id, report.id))
            .returning();

        const updated = updatedRows[0];

        if (!updated) {
            throw new AppError("Unable to update listing report.", 500, "LISTING_REPORT_UPDATE_FAILED");
        }

        await writeAudit(tx, {
            actorUserId: input.adminId,
            action: `LISTING_REPORT_${input.decision}`,
            entityType: "LISTING_REPORT",
            entityId: report.id,
            ...(input.ipAddress !== undefined ? { ipAddress: input.ipAddress } : {}),
            ...(input.userAgent !== undefined ? { userAgent: input.userAgent } : {}),
            metadata: {
                listingId: report.listingId,
                reporterId: report.reporterId,
                reason: report.reason,
                resolutionNote: input.resolutionNote ?? null,
            },
        });

        return updated;
    });
}

export function isListingStatus(value: string): value is ListingStatus {
    return (LISTING_STATUSES as readonly string[]).includes(value);
}
