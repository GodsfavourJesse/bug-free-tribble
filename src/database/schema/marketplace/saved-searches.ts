import {
    index,
    jsonb,
    pgTable,
    timestamp,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { users } from "../users/users.ts";

export const savedSearches = pgTable(
    "saved_searches",
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

        name: varchar("name", {
            length: 120,
        }).notNull(),

        filters: jsonb("filters")
            .$type<Record<string, unknown>>()
            .notNull()
            .default({}),

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
        userIdIdx: index(
            "saved_searches_user_id_idx",
        ).on(table.userId),

        userCreatedAtIdx: index(
            "saved_searches_user_created_at_idx",
        ).on(
            table.userId,
            table.createdAt,
        ),
    }),

);
