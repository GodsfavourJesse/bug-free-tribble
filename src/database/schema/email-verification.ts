import {
    integer,
    pgTable,
    timestamp,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import {
    users,
} from "./users/users.ts";

export const emailVerificationTokens =
    pgTable(
        "email_verification_tokens",
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

            codeHash: varchar("code_hash", {
                length: 64,
            })
                .notNull(),

            tokenHash: varchar("token_hash", {
                length: 64,
            })
                .notNull()
                .unique(),

            attempts: integer("attempts")
                .notNull()
                .default(0),

            expiresAt: timestamp("expires_at", {
                withTimezone: true,
            }).notNull(),

            usedAt: timestamp("used_at", {
                withTimezone: true,
            }),

            createdAt: timestamp("created_at", {
                withTimezone: true,
            })
                .notNull()
                .defaultNow(),
        },
    );
