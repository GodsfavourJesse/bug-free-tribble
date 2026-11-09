import { sql } from "drizzle-orm";

import {
    check,
    index,
    integer,
    pgTable,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { users } from "./users/users.ts";

export const listingCreditLedger = pgTable(
    "listing_credit_ledger",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, {
                onDelete: "restrict",
            }),

        amount: integer("amount")
            .notNull(),

        reason: varchar("reason", {
            length: 100,
        }).notNull(),

        /**
         * Identifies the credit pool affected by this entry.
         *
         * FREE_TRIAL:
         * Free credits granted during registration.
         *
         * SUBSCRIPTION_CREDIT:
         * Credits granted from purchased subscription plans.
         *
         * ADMIN_ADJUSTMENT:
         * Credits granted or deducted by administrators.
         */
        creditSource: varchar("credit_source", {
            length: 40,
        }).notNull(),

        referenceId: uuid("reference_id").notNull(),

        createdAt: timestamp("created_at", {
            withTimezone: true,
        })
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        userCreatedIdx: index(
            "listing_credit_ledger_user_created_idx",
        ).on(
            table.userId,
            table.createdAt,
        ),

        reasonIdx: index(
            "listing_credit_ledger_reason_idx",
        ).on(
            table.reason,
        ),

        sourceIdx: index(
            "listing_credit_ledger_source_idx",
        ).on(
            table.userId,
            table.creditSource,
        ),

        referenceUniqueIdx: uniqueIndex(
            "listing_credit_ledger_reference_unique_idx",
        ).on(
            table.userId,
            table.reason,
            table.referenceId,
        ),

        amountCheck: check(
            "listing_credit_ledger_amount_nonzero_check",
            sql`${table.amount} <> 0`,
        ),

        sourceCheck: check(
            "listing_credit_ledger_source_check",
            sql`${table.creditSource} IN (
                'FREE_TRIAL',
                'SUBSCRIPTION_CREDIT',
                'ADMIN_ADJUSTMENT'
            )`,
        ),
                reasonSourceCheck: check(
            "listing_credit_ledger_reason_source_check",
            sql`
                (
                    ${table.reason} = 'FREE_TRIAL'
                    AND ${table.creditSource} = 'FREE_TRIAL'
                    AND ${table.amount} > 0
                )
                OR
                (
                    ${table.reason} = 'SUBSCRIPTION_CREDIT'
                    AND ${table.creditSource} = 'SUBSCRIPTION_CREDIT'
                    AND ${table.amount} > 0
                )
                OR
                (
                    ${table.reason} = 'ADMIN_ADJUSTMENT'
                    AND ${table.creditSource} = 'ADMIN_ADJUSTMENT'
                )
                OR
                (
                    ${table.reason} = 'LISTING_CREATED'
                    AND ${table.amount} = -1
                )
            `,
        ),
    }),
);