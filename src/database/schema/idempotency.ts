import {
    check,
    index,
    integer,
    jsonb,
    pgTable,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { users } from "./users/users.ts";

import { listings } from "./listings/listings.ts";
import { sql } from "drizzle-orm";

/**
 * Stores idempotency records for operations that must not
 * execute more than once for the same request key.
 *
 * For listing creation:
 *
 * - A key belongs to one authenticated user.
 * - A key belongs to one operation.
 * - A payload hash prevents key reuse with different data.
 * - A completed record references the listing created.
 * - The record and listing are committed in one transaction.
 */
export const idempotencyRecords = pgTable(
    "idempotency_records",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, {
                onDelete: "cascade",
            }),

        operation: varchar("operation", {
            length: 100,
        }).notNull(),

        key: varchar("key", {
            length: 255,
        }).notNull(),

        payloadHash: varchar("payload_hash", {
            length: 64,
        }).notNull(),

        listingId: uuid("listing_id")
            .references(() => listings.id, {
                onDelete: "set null",
            }),

        responseStatus: integer("response_status")
            .notNull()
            .default(201),

        responseBody: jsonb("response_body")
            .$type<Record<string, unknown>>(),

        createdAt: timestamp("created_at", {
            withTimezone: true,
        })
            .notNull()
            .defaultNow(),

        expiresAt: timestamp("expires_at", {
            withTimezone: true,
        })
            .notNull(),
    },
    (table) => ({
        ownerOperationKeyUnique: uniqueIndex(
            "idempotency_records_owner_operation_key_unique",
        ).on(
            table.userId,
            table.operation,
            table.key,
        ),

        expiryIdx: index(
            "idempotency_records_expires_at_idx",
        ).on(table.expiresAt),

        listingIdx: index(
            "idempotency_records_listing_id_idx",
        ).on(table.listingId),

        keyLengthCheck: check(
            "idempotency_records_key_length_check",
            // A non-empty key, with a maximum of 255 characters.
            // The varchar column enforces the maximum.
            // This constraint rejects empty or whitespace-only keys.
            sql`length(trim(${table.key})) > 0`,
        ),
    }),
);