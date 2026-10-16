import {
    check,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";

export const jobTypeEnum =
    pgEnum(
        "job_type",
        [
            "IMAGE_ANALYSIS",
            "NOTIFICATION_DISPATCH",
            "LIFECYCLE",
        ],
    );

export const jobStatusEnum =
    pgEnum(
        "job_status",
        [
            "QUEUED",
            "PROCESSING",
            "COMPLETED",
            "FAILED",
        ],
    );

export const jobs = pgTable(
    "jobs",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        type: jobTypeEnum(
            "type",
        ).notNull(),

        status:
            jobStatusEnum(
                "status",
            )
                .notNull()
                .default("QUEUED"),

        payload: jsonb(
            "payload",
        )
            .$type<
                Record<string, unknown>
            >()
            .notNull(),

        attempts: integer(
            "attempts",
        )
            .notNull()
            .default(0),

        maxAttempts: integer(
            "max_attempts",
        )
            .notNull()
            .default(5),

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

        lockedBy: varchar(
            "locked_by",
            {
                length: 255,
            },
        ),

        lastError: text(
            "last_error",
        ),

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
        queueIdx: index(
            "jobs_queue_idx",
        ).on(
            table.status,
            table.availableAt,
            table.createdAt,
        ),

        staleIdx: index(
            "jobs_stale_idx",
        ).on(
            table.status,
            table.lockedAt,
        ),

        typeStatusIdx: index(
            "jobs_type_status_idx",
        ).on(
            table.type,
            table.status,
        ),

        attemptsValidCheck: check(
            "jobs_attempts_valid",
            sql`
                ${table.attempts} >= 0
                AND
                ${table.maxAttempts} > 0
                AND
                ${table.attempts} <= ${table.maxAttempts}
            `,
        ),
    }),
);