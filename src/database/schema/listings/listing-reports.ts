import {
    index,
    pgEnum,
    pgTable,
    text,
    timestamp,
    unique,
    uuid,
} from "drizzle-orm/pg-core";

import { listings } from "./listings.ts";
import { users } from "../users/users.ts";

export const listingReportReasonEnum = pgEnum(
    "listing_report_reason",
    [
        "SCAM_OR_FRAUD",
        "WRONG_VEHICLE_INFORMATION",
        "DUPLICATE_LISTING",
        "ALREADY_SOLD",
        "INAPPROPRIATE_CONTENT",
        "MISLEADING_PRICE",
        "OTHER",
    ],
);

export const listingReportStatusEnum = pgEnum(
    "listing_report_status",
    [
        "PENDING",
        "REVIEWING",
        "RESOLVED",
        "DISMISSED",
    ],
);

export const listingReports = pgTable(
    "listing_reports",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        listingId: uuid("listing_id")
            .notNull()
            .references(() => listings.id, {
                onDelete: "cascade",
            }),

        reporterId: uuid("reporter_id")
            .notNull()
            .references(() => users.id, {
                onDelete: "cascade",
            }),

        reason: listingReportReasonEnum(
            "reason",
        ).notNull(),

        details: text("details"),

        status: listingReportStatusEnum(
            "status",
        )
            .notNull()
            .default("PENDING"),

        resolutionNote: text(
            "resolution_note",
        ),

        resolvedBy: uuid("resolved_by").references(
            () => users.id,
            {
                onDelete: "set null",
            },
        ),

        resolvedAt: timestamp("resolved_at", {
            withTimezone: true,
        }),

        createdAt: timestamp("created_at", {
            withTimezone: true,
        })
            .notNull()
            .defaultNow(),

        updatedAt: timestamp("updated_at", {
            withTimezone: true,
        })
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        reporterListingUnique: unique(
            "listing_reports_reporter_listing_unique",
        ).on(
            table.reporterId,
            table.listingId,
        ),

        listingStatusIdx: index(
            "listing_reports_listing_status_idx",
        ).on(
            table.listingId,
            table.status,
            table.createdAt,
        ),

        reporterCreatedIdx: index(
            "listing_reports_reporter_created_idx",
        ).on(
            table.reporterId,
            table.createdAt,
        ),

        statusCreatedIdx: index(
            "listing_reports_status_created_idx",
        ).on(
            table.status,
            table.createdAt,
        ),

        resolvedByIdx: index(
            "listing_reports_resolved_by_idx",
        ).on(
            table.resolvedBy,
            table.resolvedAt,
        ),
    }),
);