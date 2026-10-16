import {
    pgEnum,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";

import { users } from "../users/users.ts";

export const dealerApplicationStatusEnum = pgEnum(
    "dealer_application_status",
    [
        "PENDING",
        "APPROVED",
        "REJECTED",
    ],
);

export const dealerApplications = pgTable(
    "dealer_applications",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        userId: uuid("user_id")
            .notNull()
            .references(
                () => users.id,
                {
                    onDelete: "cascade",
                },
            ),

        companyName: varchar("company_name", {
            length: 200,
        }).notNull(),

        registrationNumber: varchar("registration_number", {
            length: 100,
        }),

        businessAddress: text("business_address"),

        status: dealerApplicationStatusEnum("status")
            .notNull()
            .default("PENDING"),

        rejectionReason: text("rejection_reason"),

        /**
         * Administrator who made the final decision.
         *
         * Nullable to preserve the application if the
         * reviewing administrator's account is deleted.
         */
        reviewedByUserId: uuid("reviewed_by_user_id")
            .references(
                () => users.id,
                {
                    onDelete: "set null",
                },
            ),

        /**
         * Time the application was approved or rejected.
         */
        reviewedAt: timestamp("reviewed_at", {
            withTimezone: true,
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
        onePendingPerUserIdx: uniqueIndex(
            "dealer_applications_one_pending_idx",
        )
            .on(table.userId)
            .where(
                sql`${table.status} = 'PENDING'`,
            ),
    }),
);