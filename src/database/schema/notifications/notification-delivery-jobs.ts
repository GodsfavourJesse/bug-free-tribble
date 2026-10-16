import {
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { users } from "../users/users.ts";

export const notificationChannelEnum = pgEnum(
    "notification_channel",
    [
        "IN_APP",
        "SOCKET",
        "EMAIL",
        "PUSH",
    ],
);

export const notificationDeliveryStatusEnum = pgEnum(
    "notification_delivery_status",
    [
        "PENDING",
        "PROCESSING",
        "SUCCEEDED",
        "FAILED",
    ],
);

export const notificationDeliveryJobs = pgTable(
    "notification_delivery_jobs",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, {
                onDelete: "cascade",
            }),

        channel: notificationChannelEnum("channel")
            .notNull(),

        /*
         * Stable identifier used to prevent duplicate jobs
         * for the same event, user, and delivery channel.
         */
        idempotencyKey: varchar("idempotency_key", {
            length: 255,
        })
            .notNull(),

        /*
         * Contains the data required by the delivery worker.
         * Never store passwords, session tokens, or other secrets.
         */
        payload: jsonb("payload")
            .$type<Record<string, unknown>>()
            .notNull(),

        status: notificationDeliveryStatusEnum("status")
            .notNull()
            .default("PENDING"),

        attempts: integer("attempts")
            .notNull()
            .default(0),

        maxAttempts: integer("max_attempts")
            .notNull()
            .default(5),

        /*
         * Jobs cannot be processed before this timestamp.
         * Failed jobs can be scheduled for retry.
         */
        availableAt: timestamp("available_at", {
            withTimezone: true,
        })
            .notNull()
            .defaultNow(),

        /*
         * Used to track which worker claimed the job.
         */
        lockedAt: timestamp("locked_at", {
            withTimezone: true,
        }),

        workerId: varchar("worker_id", {
            length: 150,
        }),

        processedAt: timestamp("processed_at", {
            withTimezone: true,
        }),

        lastError: varchar("last_error", {
            length: 2000,
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
        idempotencyIdx: uniqueIndex(
            "notification_delivery_jobs_idempotency_idx",
        ).on(table.idempotencyKey),

        pendingJobsIdx: index(
            "notification_delivery_jobs_pending_idx",
        ).on(
            table.status,
            table.availableAt,
        ),

        userChannelIdx: index(
            "notification_delivery_jobs_user_channel_idx",
        ).on(
            table.userId,
            table.channel,
        ),

        processingIdx: index(
            "notification_delivery_jobs_processing_idx",
        ).on(
            table.status,
            table.lockedAt,
        ),
    }),
);