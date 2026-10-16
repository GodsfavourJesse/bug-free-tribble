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
import { vehicleModels } from "./vehicles.ts";


export const vehicleEngines =
    pgTable(
        "vehicle_engines",
        {
            id: uuid("id")
                .defaultRandom()
                .primaryKey(),

            /**
             * The model this engine belongs to.
             *
             * Example:
             * Toyota Camry → 2.5L Dynamic Force
             */
            modelId: uuid("model_id")
                .notNull()
                .references(
                    () => vehicleModels.id,
                    {
                        onDelete: "restrict",
                    },
                ),

            /**
             * Human-readable engine name.
             *
             * Example:
             * 2.5L Dynamic Force
             * 3.5L V6
             * 1.8L VVT-i
             */
            name: varchar("name", {
                length: 150,
            })
                .notNull(),

            /**
             * Stable identifier for imports,
             * searching and administration.
             */
            slug: varchar("slug", {
                length: 180,
            })
                .notNull(),

            /**
             * Engine displacement in cubic centimetres.
             *
             * Example:
             * 2487 = 2.5L
             */
            displacementCc: integer(
                "displacement_cc",
            ),

            /**
             * Number of cylinders.
             */
            cylinders: integer(
                "cylinders",
            ),

            /**
             * Approximate horsepower rating.
             */
            horsepower: integer(
                "horsepower",
            ),

            /**
             * Search aliases.
             *
             * Example:
             * [
             *     "2.5",
             *     "2.5l",
             *     "dynamic force 2.5",
             * ]
             */
            aliases: jsonb("aliases")
                .$type<string[]>()
                .notNull()
                .default([]),

            /**
             * Whether this engine is applicable
             * to the Nigerian market.
             */
            nigeriaMarket: boolean(
                "nigeria_market",
            )
                .notNull()
                .default(true),

            /**
             * Soft-disable the engine without
             * deleting historical references.
             */
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
                "vehicle_engines_model_name_unique",
            ).on(
                table.modelId,
                table.name,
            ),

            unique(
                "vehicle_engines_model_slug_unique",
            ).on(
                table.modelId,
                table.slug,
            ),

            index(
                "vehicle_engines_model_idx",
            ).on(
                table.modelId,
            ),

            index(
                "vehicle_engines_active_idx",
            ).on(
                table.modelId,
                table.active,
            ),

            index(
                "vehicle_engines_market_idx",
            ).on(
                table.modelId,
                table.nigeriaMarket,
                table.active,
            ),

            check(
                "vehicle_engines_displacement_check",
                sql`
                    displacement_cc IS NULL
                    OR displacement_cc > 0
                `,
            ),

            check(
                "vehicle_engines_cylinders_check",
                sql`
                    cylinders IS NULL
                    OR cylinders > 0
                `,
            ),

            check(
                "vehicle_engines_horsepower_check",
                sql`
                    horsepower IS NULL
                    OR horsepower > 0
                `,
            ),
        ],
    );