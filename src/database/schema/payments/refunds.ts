import {
    check,
    index,
    jsonb,
    numeric,
    pgEnum,
    pgTable,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";

import { users } from "../users/users.ts";
import { payments } from "./payments.ts";

export const refundStatusEnum = pgEnum(
    "refund_status",
    [
        "PENDING",
        "APPROVED",
        "PROCESSING",
        "SUCCESS",
        "FAILED",
        "REJECTED",
    ],
);

export const refundRequests = pgTable(
    "refund_requests",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        /*
         * Original payment being refunded.
         */
        paymentId: uuid("payment_id")
            .notNull()
            .references(
                () => payments.id,
                {
                    onDelete: "restrict",
                },
            ),

        /*
         * User who requested the refund.
         */
        requestedBy: uuid("requested_by")
            .notNull()
            .references(
                () => users.id,
                {
                    onDelete: "restrict",
                },
            ),

        /*
         * Administrator who approved or rejected it.
         */
        reviewedBy: uuid("reviewed_by")
            .references(
                () => users.id,
                {
                    onDelete: "set null",
                },
            ),

        status: refundStatusEnum(
            "status",
        )
            .notNull()
            .default("PENDING"),

        /*
         * Amount is stored in the payment currency's major unit.
         * Example: NGN 5000.00.
         */
        amount: numeric(
            "amount",
            {
                precision: 14,
                scale: 2,
            },
        ).notNull(),

        currency: varchar(
            "currency",
            {
                length: 10,
            },
        ).notNull(),

        reason: varchar(
            "reason",
            {
                length: 1000,
            },
        ).notNull(),

        reviewNote: varchar(
            "review_note",
            {
                length: 1000,
            },
        ),

        /*
         * Provider reference and response details.
         */
        provider: varchar(
            "provider",
            {
                length: 50,
            },
        )
            .notNull()
            .default("PAYSTACK"),

        providerRefundId: varchar(
            "provider_refund_id",
            {
                length: 120,
            },
        ),

        providerData: jsonb(
            "provider_data",
        ),

        /*
         * Idempotency key supplied or generated when creating
         * the refund request.
         */
        idempotencyKey: varchar(
            "idempotency_key",
            {
                length: 120,
            },
        )
            .notNull(),

        /*
         * Retry and processing metadata.
         */
        attemptCount: numeric(
            "attempt_count",
            {
                precision: 10,
                scale: 0,
            },
        )
            .notNull()
            .default("0"),

        lastError: varchar(
            "last_error",
            {
                length: 2000,
            },
        ),

        processedAt: timestamp(
            "processed_at",
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
        paymentIdx: index(
            "refund_requests_payment_idx",
        ).on(
            table.paymentId,
            table.createdAt,
        ),

        statusCreatedIdx: index(
            "refund_requests_status_created_idx",
        ).on(
            table.status,
            table.createdAt,
        ),

        requesterIdx: index(
            "refund_requests_requester_idx",
        ).on(
            table.requestedBy,
            table.createdAt,
        ),

        providerRefundUniqueIdx: uniqueIndex(
            "refund_requests_provider_refund_unique_idx",
        )
            .on(
                table.provider,
                table.providerRefundId,
            )
            .where(
                sql`${table.providerRefundId} IS NOT NULL`,
            ),

        idempotencyUniqueIdx: uniqueIndex(
            "refund_requests_idempotency_unique_idx",
        ).on(
            table.idempotencyKey,
        ),

        amountPositiveCheck: check(
            "refund_requests_amount_positive",
            sql`${table.amount} > 0`,
        ),

        attemptCountNonNegativeCheck: check(
            "refund_requests_attempt_count_non_negative",
            sql`${table.attemptCount} >= 0`,
        ),
    }),
);