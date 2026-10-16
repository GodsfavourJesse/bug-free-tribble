import {
    check,
    index,
    integer,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";

import { payments } from "./payments.ts";

export const paymentReconciliationStatusEnum =
    pgEnum(
        "payment_reconciliation_status",
        [
            "PENDING",
            "PROCESSING",
            "RETRY",
            "RESOLVED",
            "DEAD_LETTER",
            "IGNORED",
        ],
    );

export const paymentReconciliations =
    pgTable(
        "payment_reconciliations",
        {
            id: uuid("id")
                .defaultRandom()
                .primaryKey(),

            paymentId: uuid("payment_id")
                .notNull()
                .references(
                    () => payments.id,
                    {
                        onDelete: "cascade",
                    },
                ),

            status:
                paymentReconciliationStatusEnum(
                    "status",
                )
                    .notNull()
                    .default("PENDING"),

            attemptCount: integer(
                "attempt_count",
            )
                .notNull()
                .default(0),

            nextAttemptAt: timestamp(
                "next_attempt_at",
                {
                    withTimezone: true,
                },
            )
                .notNull()
                .defaultNow(),

            lastAttemptAt: timestamp(
                "last_attempt_at",
                {
                    withTimezone: true,
                },
            ),

            resolvedAt: timestamp(
                "resolved_at",
                {
                    withTimezone: true,
                },
            ),

            lockedUntil: timestamp(
                "locked_until",
                {
                    withTimezone: true,
                },
            ),

            lockedBy: varchar(
                "locked_by",
                {
                    length: 150,
                },
            ),

            lastErrorCode: varchar(
                "last_error_code",
                {
                    length: 100,
                },
            ),

            lastErrorMessage: text(
                "last_error_message",
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
            paymentUniqueIdx: uniqueIndex(
                "payment_reconciliations_payment_unique_idx",
            ).on(
                table.paymentId,
            ),

            statusNextAttemptIdx: index(
                "payment_reconciliations_status_next_attempt_idx",
            ).on(
                table.status,
                table.nextAttemptAt,
            ),

            lockedUntilIdx: index(
                "payment_reconciliations_locked_until_idx",
            ).on(
                table.lockedUntil,
            ),

            attemptCountCheck: check(
                "payment_reconciliations_attempt_count_check",
                sql`${table.attemptCount} >= 0`,
            ),

            leaseConsistencyCheck: check(
                "payment_reconciliations_lease_consistency_check",
                sql`
                    (
                        ${table.status} = 'PROCESSING'
                        AND ${table.lockedBy} IS NOT NULL
                        AND ${table.lockedUntil} IS NOT NULL
                    )
                    OR
                    (
                        ${table.status} <> 'PROCESSING'
                        AND ${table.lockedBy} IS NULL
                        AND ${table.lockedUntil} IS NULL
                    )
                `,
            ),
        }),
    );

export type PaymentReconciliation =
    typeof paymentReconciliations.$inferSelect;

export type NewPaymentReconciliation =
    typeof paymentReconciliations.$inferInsert;