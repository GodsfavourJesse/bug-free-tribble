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

import { relations, sql } from "drizzle-orm";

/**
 * VEHICLE MAKES
 *
 * Examples:
 * Toyota, Honda, Mercedes-Benz, Ferrari, Bugatti.
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

        nigeriaMarket: boolean("nigeria_market")
            .notNull()
            .default(true),

        active: boolean("active")
            .notNull()
            .default(true),

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
    (table) => [
        index("vehicle_makes_active_idx")
            .on(table.active),

        index("vehicle_makes_nigeria_market_idx")
            .on(table.nigeriaMarket),

        index("vehicle_makes_name_idx")
            .on(table.name),
    ],
);

/**
 * VEHICLE MODELS
 *
 * Examples:
 * Toyota -> Camry
 * Mercedes-Benz -> C-Class
 * Ferrari -> 296 GTB
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
                    onUpdate: "cascade",
                },
            ),

        name: varchar("name", {
            length: 100,
        }).notNull(),

        slug: varchar("slug", {
            length: 120,
        }).notNull(),

        aliases: jsonb("aliases")
            .$type<string[]>()
            .notNull()
            .default([]),

        nigeriaMarket: boolean("nigeria_market")
            .notNull()
            .default(true),

        active: boolean("active")
            .notNull()
            .default(true),

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
    (table) => [
        unique("vehicle_models_make_name_unique")
            .on(
                table.makeId,
                table.name,
            ),

        unique("vehicle_models_make_slug_unique")
            .on(
                table.makeId,
                table.slug,
            ),

        index("vehicle_models_make_id_idx")
            .on(table.makeId),

        index("vehicle_models_active_idx")
            .on(table.active),

        index("vehicle_models_nigeria_market_idx")
            .on(table.nigeriaMarket),

        index("vehicle_models_name_idx")
            .on(table.name),
    ],
);

/**
 * VEHICLE GENERATIONS
 *
 * Examples:
 * Toyota Camry -> XV70
 * Toyota Camry -> XV80
 *
 * Start and end years are nullable because some vehicles
 * do not have consistently documented generation boundaries.
 */
export const vehicleGenerations = pgTable(
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
                    onUpdate: "cascade",
                },
            ),

        name: varchar("name", {
            length: 150,
        }).notNull(),

        slug: varchar("slug", {
            length: 180,
        }).notNull(),

        startYear: integer("start_year"),

        endYear: integer("end_year"),

        aliases: jsonb("aliases")
            .$type<string[]>()
            .notNull()
            .default([]),

        nigeriaMarket: boolean("nigeria_market")
            .notNull()
            .default(true),

        active: boolean("active")
            .notNull()
            .default(true),

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
    (table) => [
        unique("vehicle_generations_model_name_unique")
            .on(
                table.modelId,
                table.name,
            ),

        unique("vehicle_generations_model_slug_unique")
            .on(
                table.modelId,
                table.slug,
            ),

        index("vehicle_generations_model_id_idx")
            .on(table.modelId),

        index("vehicle_generations_active_idx")
            .on(table.active),

        index("vehicle_generations_nigeria_market_idx")
            .on(table.nigeriaMarket),

        index("vehicle_generations_year_range_idx")
            .on(
                table.startYear,
                table.endYear,
            ),

        check(
            "vehicle_generations_year_range_check",
            sql`
                (
                    ${table.startYear} IS NULL
                    OR ${table.endYear} IS NULL
                    OR ${table.startYear} <= ${table.endYear}
                )
            `,
        ),
    ],
);

/**
 * RELATIONS
 */

export const vehicleMakesRelations = relations(
    vehicleMakes,
    ({ many }) => ({
        models: many(vehicleModels),
    }),
);

export const vehicleModelsRelations = relations(
    vehicleModels,
    ({ one, many }) => ({
        make: one(vehicleMakes, {
            fields: [
                vehicleModels.makeId,
            ],
            references: [
                vehicleMakes.id,
            ],
        }),

        generations: many(vehicleGenerations),
    }),
);

export const vehicleGenerationsRelations = relations(
    vehicleGenerations,
    ({ one }) => ({
        model: one(vehicleModels, {
            fields: [
                vehicleGenerations.modelId,
            ],
            references: [
                vehicleModels.id,
            ],
        }),
    }),
);