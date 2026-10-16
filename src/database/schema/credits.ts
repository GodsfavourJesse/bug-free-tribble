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
        id: uuid("id").defaultRandom().primaryKey(),

        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, {
                onDelete: "restrict",
            }),

        amount: integer("amount").notNull(),

        reason: varchar("reason", {
            length: 100,
        }).notNull(),

        referenceId: uuid("reference_id"),

        createdAt: timestamp("created_at", {
            withTimezone: true,
        })
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        userCreatedIdx: index(
            "listing_credit_ledger_user_created_idx",
        ).on(table.userId, table.createdAt),

        reasonIdx: index(
            "listing_credit_ledger_reason_idx",
        ).on(table.reason),

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
    }),
);