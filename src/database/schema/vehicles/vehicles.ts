import {
    boolean,
    check,
    index,
    integer,
    jsonb,
    pgTable,
    timestamp,
    unique,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";

/**
 * Vehicle makes
 *
 * Example:
 * Toyota
 * Mercedes-Benz
 * BMW
 */
export const vehicleMakes = pgTable(
    "vehicle_makes",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        name: varchar("name", {
            length: 100,
        })
            .notNull()
            .unique(),

        slug: varchar("slug", {
            length: 120,
        })
            .notNull()
            .unique(),

        aliases: jsonb("aliases")
            .$type<string[]>()
            .notNull()
            .default([]),

        nigeriaMarket: boolean(
            "nigeria_market",
        )
            .notNull()
            .default(true),

        active: boolean("active")
            .notNull()
            .default(true),

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
    (table) => [
        index(
            "vehicle_makes_active_idx",
        ).on(table.active),

        index(
            "vehicle_makes_nigeria_market_idx",
        ).on(table.nigeriaMarket),
    ],
);

/**
 * Vehicle models
 *
 * Example:
 * Toyota → Camry
 * Toyota → Corolla
 * BMW → 3 Series
 */
export const vehicleModels = pgTable(
    "vehicle_models",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        makeId: uuid("make_id")
            .notNull()
            .references(
                () => vehicleMakes.id,
                {
                    onDelete: "restrict",
                },
            ),

        name: varchar("name", {
            length: 100,
        })
            .notNull(),

        slug: varchar("slug", {
            length: 120,
        })
            .notNull(),

        aliases: jsonb("aliases")
            .$type<string[]>()
            .notNull()
            .default([]),

        nigeriaMarket: boolean(
            "nigeria_market",
        )
            .notNull()
            .default(true),

        active: boolean("active")
            .notNull()
            .default(true),

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
    (table) => [
        unique(
            "vehicle_models_make_name_unique",
        ).on(
            table.makeId,
            table.name,
        ),

        unique(
            "vehicle_models_make_slug_unique",
        ).on(
            table.makeId,
            table.slug,
        ),

        index(
            "vehicle_models_make_idx",
        ).on(table.makeId),

        index(
            "vehicle_models_active_idx",
        ).on(
            table.makeId,
            table.active,
        ),

        index(
            "vehicle_models_nigeria_market_idx",
        ).on(
            table.makeId,
            table.nigeriaMarket,
        ),
    ],
);

/**
 * Vehicle generations
 *
 * Example:
 * Toyota Camry → XV70
 * Toyota Camry → XV80
 */
export const vehicleGenerations =
    pgTable(
        "vehicle_generations",
        {
            id: uuid("id")
                .defaultRandom()
                .primaryKey(),

            modelId: uuid("model_id")
                .notNull()
                .references(
                    () => vehicleModels.id,
                    {
                        onDelete: "restrict",
                    },
                ),

            name: varchar("name", {
                length: 150,
            })
                .notNull(),

            slug: varchar("slug", {
                length: 180,
            })
                .notNull(),

            startYear: integer(
                "start_year",
            ),

            endYear: integer(
                "end_year",
            ),

            aliases: jsonb("aliases")
                .$type<string[]>()
                .notNull()
                .default([]),

            nigeriaMarket: boolean(
                "nigeria_market",
            )
                .notNull()
                .default(true),

            active: boolean("active")
                .notNull()
                .default(true),

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
        (table) => [
            unique(
                "vehicle_generations_model_name_unique",
            ).on(
                table.modelId,
                table.name,
            ),

            unique(
                "vehicle_generations_model_slug_unique",
            ).on(
                table.modelId,
                table.slug,
            ),

            index(
                "vehicle_generations_model_idx",
            ).on(table.modelId),

            index(
                "vehicle_generations_active_idx",
            ).on(
                table.modelId,
                table.active,
            ),

            index(
                "vehicle_generations_nigeria_market_idx",
            ).on(
                table.modelId,
                table.nigeriaMarket,
            ),

            check(
                "vehicle_generations_year_range_check",
                sql`
                    start_year IS NULL
                    OR end_year IS NULL
                    OR end_year >= start_year
                `,
            ),
        ],
    );