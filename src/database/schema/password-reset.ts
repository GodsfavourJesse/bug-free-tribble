import {
    index,
    pgTable,
    timestamp,
    uuid,
    varchar,
    uniqueIndex,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";

import { users } from "./users/users.ts";

export const passwordResetTokens =
    pgTable(
        "password_reset_tokens",
        {
            id: uuid("id")
                .defaultRandom()
                .primaryKey(),

            userId: uuid("user_id")
                .notNull()
                .references(
                    () => users.id,
                    {
                        onDelete:
                            "cascade",
                    },
                ),

            tokenHash: varchar(
                "token_hash",
                {
                    length: 64,
                },
            )
                .notNull()
                .unique(),

            expiresAt: timestamp(
                "expires_at",
                {
                    withTimezone: true,
                },
            ).notNull(),

            usedAt: timestamp(
                "used_at",
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

        (table) => [
            index(
                "password_reset_tokens_user_idx",
            ).on(
                table.userId,
                table.createdAt,
            ),

            index(
                "password_reset_tokens_expiry_idx",
            ).on(
                table.expiresAt,
            ),

            uniqueIndex(
                "password_reset_tokens_one_active_per_user_idx",
            )
                .on(table.userId)
                .where(
                    sql`${table.usedAt} IS NULL`,
                ),
        ],
    );