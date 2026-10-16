import {
    index,
    integer,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";

import { listingImages } from "../listings/listing-images.ts";

export const imageAnalysisJobStatusEnum =
    pgEnum(
        "image_analysis_job_status",
        [
            "QUEUED",
            "PROCESSING",
            "COMPLETED",
            "FAILED",
            "CANCELLED",
        ],
    );

export const imageAnalysisJobs =
    pgTable(
        "image_analysis_jobs",
        {
            id: uuid("id")
                .defaultRandom()
                .primaryKey(),

            listingImageId: uuid("listing_image_id")
                .notNull()
                .references(
                    () => listingImages.id,
                    {
                        onDelete: "cascade",
                    },
                ),

            analysisRunId: uuid(
                "analysis_run_id",
            ),

            status: imageAnalysisJobStatusEnum(
                "status",
            )
                .notNull()
                .default("QUEUED"),

            priority: integer("priority")
                .notNull()
                .default(100),

            attempts: integer("attempts")
                .notNull()
                .default(0),

            maxAttempts: integer("max_attempts")
                .notNull()
                .default(3),

            availableAt: timestamp(
                "available_at",
                {
                    withTimezone: true,
                },
            )
                .notNull()
                .defaultNow(),

            lockedAt: timestamp(
                "locked_at",
                {
                    withTimezone: true,
                },
            ),

            lockedBy: text("locked_by"),

            startedAt: timestamp(
                "started_at",
                {
                    withTimezone: true,
                },
            ),

            completedAt: timestamp(
                "completed_at",
                {
                    withTimezone: true,
                },
            ),

            failedAt: timestamp(
                "failed_at",
                {
                    withTimezone: true,
                },
            ),

            lastError: text("last_error"),

            createdAt: timestamp(
                "created_at",
                {
                    withTimezone: true,
                },
            )
                .notNull()
                .defaultNow(),

            updatedAt: timestamp(
                "updated_at",
                {
                    withTimezone: true,
                },
            )
                .notNull()
                .defaultNow(),
        },
        (table) => ({
            statusAvailableIdx: index(
                "image_analysis_jobs_status_available_idx",
            ).on(
                table.status,
                table.availableAt,
            ),

            imageIdx: index(
                "image_analysis_jobs_image_idx",
            ).on(
                table.listingImageId,
            ),

            lockedIdx: index(
                "image_analysis_jobs_locked_idx",
            ).on(
                table.lockedAt,
            ),

            priorityIdx: index(
                "image_analysis_jobs_priority_idx",
            ).on(
                table.priority,
                table.availableAt,
            ),

            activeImageJobUniqueIdx: uniqueIndex(
                "image_analysis_jobs_active_image_unique_idx",
            )
                .on(table.listingImageId)
                .where(
                    sql`${table.status} IN ('QUEUED', 'PROCESSING')`,
                ),
        }),
    );