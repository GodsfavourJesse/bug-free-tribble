import {
    index,
    integer,
    pgTable,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { users } from "./users/users.ts";

/**
 * Tracks failed authentication attempts by a hashed
 * email + IP combination.
 *
 * No plaintext authentication identifier is stored here.
 */
export const authLoginThrottles = pgTable(
    "auth_login_throttles",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        keyHash: varchar("key_hash", {
            length: 64,
        })
            .notNull()
            .unique(),

        userId: uuid("user_id").references(
            () => users.id,
            {
                onDelete: "set null",
            },
        ),

        failedAttempts: integer("failed_attempts")
            .notNull()
            .default(0),

        windowStartedAt: timestamp(
            "window_started_at",
            {
                withTimezone: true,
            },
        )
            .notNull()
            .defaultNow(),

        lockedUntil: timestamp(
            "locked_until",
            {
                withTimezone: true,
            },
        ),

        lastAttemptAt: timestamp(
            "last_attempt_at",
            {
                withTimezone: true,
            },
        )
            .notNull()
            .defaultNow(),

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
        userIdx: index(
            "auth_login_throttles_user_idx",
        ).on(
            table.userId,
            table.updatedAt,
        ),

        lockIdx: index(
            "auth_login_throttles_lock_idx",
        ).on(
            table.lockedUntil,
        ),

        keyUniqueIdx: uniqueIndex(
            "auth_login_throttles_key_unique_idx",
        ).on(
            table.keyHash,
        ),
    }),
);

/**
 * Tracks the server-side lifecycle of an administrator
 * security-awareness challenge.
 *
 * The raw challenge token must never be stored here.
 * Store only its cryptographic hash.
 *
 * Challenge answers and progress must be validated by
 * the backend. Frontend-only checks are not security
 * controls.
 */
export const adminSecurityChallenges = pgTable(
    "admin_security_challenges",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        tokenHash: varchar("token_hash", {
            length: 64,
        })
            .notNull()
            .unique(),

        /**
         * Nullable because a visitor has not authenticated
         * when beginning the challenge.
         */
        userId: uuid("user_id").references(
            () => users.id,
            {
                onDelete: "set null",
            },
        ),

        /**
         * Number of stages completed on the server.
         * The challenge service will enforce the valid range.
         */
        currentStage: integer("current_stage")
            .notNull()
            .default(0),

        /**
         * Total incorrect submissions.
         */
        failedAttempts: integer("failed_attempts")
            .notNull()
            .default(0),

        /**
         * Challenge lifecycle:
         * IN_PROGRESS, COMPLETED, FAILED, EXPIRED, CONSUMED.
         *
         * Keep this as a varchar so the schema remains
         * consistent with the existing project conventions.
         */
        status: varchar("status", {
            length: 20,
        })
            .notNull()
            .default("IN_PROGRESS"),

        /**
         * Hash or identifier for the selected challenge
         * configuration. Do not put correct answers or
         * secrets in client-readable metadata.
         */
        challengeVersion: varchar(
            "challenge_version",
            {
                length: 40,
            },
        )
            .notNull()
            .default("v1"),

        expiresAt: timestamp("expires_at", {
            withTimezone: true,
        }).notNull(),

        completedAt: timestamp("completed_at", {
            withTimezone: true,
        }),

        consumedAt: timestamp("consumed_at", {
            withTimezone: true,
        }),

        failedAt: timestamp("failed_at", {
            withTimezone: true,
        }),

        ipAddress: varchar("ip_address", {
            length: 64,
        }),

        userAgent: varchar("user_agent", {
            length: 500,
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
        statusExpiryIdx: index(
            "admin_security_challenges_status_expiry_idx",
        ).on(
            table.status,
            table.expiresAt,
        ),

        userCreatedIdx: index(
            "admin_security_challenges_user_created_idx",
        ).on(
            table.userId,
            table.createdAt,
        ),

        expiryIdx: index(
            "admin_security_challenges_expiry_idx",
        ).on(
            table.expiresAt,
        ),

        tokenHashUniqueIdx: uniqueIndex(
            "admin_security_challenges_token_hash_unique_idx",
        ).on(
            table.tokenHash,
        ),
    }),
);