import {
    index,
    pgTable,
    timestamp,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { users } from "../users/users.ts";

export const adminSessions = pgTable(
    "admin_sessions",
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

        tokenHash: varchar(
            "token_hash",
            {
                length: 128,
            },
        )
            .notNull()
            .unique(),

        userAgent: varchar(
            "user_agent",
            {
                length: 500,
            },
        ),

        ipAddress: varchar(
            "ip_address",
            {
                length: 64,
            },
        ),

        expiresAt: timestamp(
            "expires_at",
            {
                withTimezone: true,
            },
        ).notNull(),

        revokedAt: timestamp(
            "revoked_at",
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

        lastUsedAt: timestamp(
            "last_used_at",
            {
                withTimezone: true,
            },
        ),
    },
    (table) => ({
        userIdx: index(
            "admin_sessions_user_idx",
        ).on(
            table.userId,
            table.createdAt,
        ),

        activeIdx: index(
            "admin_sessions_active_idx",
        ).on(
            table.userId,
            table.revokedAt,
            table.expiresAt,
        ),

        expiryIdx: index(
            "admin_sessions_expiry_idx",
        ).on(
            table.expiresAt,
        ),
    }),
);