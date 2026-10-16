import {
    index,
    jsonb,
    pgTable,
    timestamp,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { users } from "./users/users.ts";

export const platformSettings =
    pgTable(
        "platform_settings",
        {
            id: uuid("id")
                .defaultRandom()
                .primaryKey(),

            key: varchar(
                "key",
                {
                    length: 120,
                },
            )
                .notNull()
                .unique(),

            value: jsonb(
                "value",
            ).notNull(),

            description: varchar(
                "description",
                {
                    length: 500,
                },
            ),

            updatedBy: uuid(
                "updated_by",
            ).references(
                () => users.id,
                {
                    onDelete: "set null",
                },
            ),

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
            updatedByIdx: index(
                "platform_settings_updated_by_idx",
            ).on(
                table.updatedBy,
            ),
        }),
    );