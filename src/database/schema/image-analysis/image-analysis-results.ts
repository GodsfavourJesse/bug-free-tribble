import {
    boolean,
    index,
    jsonb,
    numeric,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { listingImages } from "../listings/listing-images.ts";

export const imageAnalysisRunStatusEnum = pgEnum(
    "image_analysis_run_status",
    [
        "RUNNING",
        "COMPLETED",
        "FAILED",
        "CANCELLED",
    ],
);

export const imageAnalysisResultTypeEnum = pgEnum(
    "image_analysis_result_type",
    [
        "SHA256",
        "PERCEPTUAL_HASH",
        "EMBEDDING",
        "OCR",
        "MODERATION",
        "WATERMARK",
        "DUPLICATE",
    ],
);

export const imageAnalysisDecisionEnum = pgEnum(
    "image_analysis_decision",
    [
        "PASSED",
        "REVIEW",
        "FAILED",
    ],
);

export const imageAnalysisRuns = pgTable(
    "image_analysis_runs",
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

        jobId: uuid("job_id"),

        status: imageAnalysisRunStatusEnum(
            "status",
        )
            .notNull()
            .default("RUNNING"),

        provider: varchar(
            "provider",
            {
                length: 100,
            },
        )
            .notNull()
            .default("karmass"),

        providerVersion: varchar(
            "provider_version",
            {
                length: 100,
            },
        ),

        pipelineVersion: varchar(
            "pipeline_version",
            {
                length: 100,
            },
        )
            .notNull()
            .default("1.0.0"),

        modelVersion: varchar(
            "model_version",
            {
                length: 100,
            },
        ),

        decision: imageAnalysisDecisionEnum(
            "decision",
        ),

        confidence: numeric(
            "confidence",
            {
                precision: 5,
                scale: 2,
            },
        ),

        decisionReason: text(
            "decision_reason",
        ),

        errorMessage: text(
            "error_message",
        ),

        startedAt: timestamp(
            "started_at",
            {
                withTimezone: true,
            },
        )
            .notNull()
            .defaultNow(),

        completedAt: timestamp(
            "completed_at",
            {
                withTimezone: true,
            },
        ),

        createdAt: timestamp(
            "created_at",
            {
                withTimezone: true,
            },
        )
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        listingImageIdx: index(
            "image_analysis_runs_listing_image_idx",
        ).on(
            table.listingImageId,
        ),

        statusIdx: index(
            "image_analysis_runs_status_idx",
        ).on(
            table.status,
        ),

        createdAtIdx: index(
            "image_analysis_runs_created_at_idx",
        ).on(
            table.createdAt,
        ),

        decisionIdx: index(
            "image_analysis_runs_decision_idx",
        ).on(
            table.decision,
        ),
    }),
);

export const imageAnalysisResults = pgTable(
    "image_analysis_results",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        runId: uuid("run_id")
            .notNull()
            .references(
                () => imageAnalysisRuns.id,
                {
                    onDelete: "cascade",
                },
            ),

        listingImageId: uuid("listing_image_id")
            .notNull()
            .references(
                () => listingImages.id,
                {
                    onDelete: "cascade",
                },
            ),

        resultType: imageAnalysisResultTypeEnum(
            "result_type",
        )
            .notNull(),

        provider: varchar(
            "provider",
            {
                length: 100,
            },
        )
            .notNull(),

        providerVersion: varchar(
            "provider_version",
            {
                length: 100,
            },
        ),

        modelVersion: varchar(
            "model_version",
            {
                length: 100,
            },
        ),

        confidence: numeric(
            "confidence",
            {
                precision: 5,
                scale: 2,
            },
        ),

        score: numeric(
            "score",
            {
                precision: 10,
                scale: 4,
            },
        ),

        passed: boolean(
            "passed",
        ),

        data: jsonb(
            "data",
        ),

        reason: text(
            "reason",
        ),

        createdAt: timestamp(
            "created_at",
            {
                withTimezone: true,
            },
        )
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        runIdx: index(
            "image_analysis_results_run_idx",
        ).on(
            table.runId,
        ),

        listingImageIdx: index(
            "image_analysis_results_listing_image_idx",
        ).on(
            table.listingImageId,
        ),

        typeIdx: index(
            "image_analysis_results_type_idx",
        ).on(
            table.resultType,
        ),

        createdAtIdx: index(
            "image_analysis_results_created_at_idx",
        ).on(
            table.createdAt,
        ),
    }),
);