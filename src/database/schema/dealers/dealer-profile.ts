import {
    boolean,
    pgTable,
    timestamp,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { users } from "../users/users.ts";

/* ============================================================
   DEALER PROFILES
============================================================ */

export const dealerProfiles = pgTable(
    "dealer_profiles",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        userId: uuid("user_id")
            .notNull()
            .unique()
            .references(
                () => users.id,
                {
                    onDelete: "cascade",
                },
            ),

        companyName: varchar(
            "company_name",
            {
                length: 200,
            },
        ).notNull(),

        verified: boolean(
            "verified",
        )
            .notNull()
            .default(false),

        verifiedAt: timestamp(
            "verified_at",
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
);