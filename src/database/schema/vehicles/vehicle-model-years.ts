import {
    boolean,
    check,
    index,
    integer,
    pgTable,
    timestamp,
    unique,
    uuid,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";

import {
    vehicleGenerations,
} from "./vehicles.ts";

/**
 * VEHICLE MODEL YEARS
 *
 * Represents a specific model year belonging
 * to a vehicle generation.
 *
 * Example:
 *
 * Toyota Camry
 *   └── XV70
 *       ├── 2018
 *       ├── 2019
 *       ├── 2020
 *       └── 2021
 *
 * Model years are independent records so that
 * availability can be managed separately from
 * individual vehicle variants.
 */
export const vehicleModelYears = pgTable(
    "vehicle_model_years",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        /**
         * Generation to which this model year belongs.
         */
        generationId: uuid(
            "generation_id",
        )
            .notNull()
            .references(
                () => vehicleGenerations.id,
                {
                    onDelete: "restrict",
                    onUpdate: "cascade",
                },
            ),

        /**
         * Official vehicle model year.
         *
         * This is not necessarily the same as
         * the calendar year of manufacture.
         */
        year: integer("year")
            .notNull(),

        /**
         * Whether this model-year record belongs
         * to the Nigerian-market catalog.
         */
        nigeriaMarket: boolean(
            "nigeria_market",
        )
            .notNull()
            .default(true),

        /**
         * Allows the year to be hidden from new
         * catalog selections without deleting it.
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
        /**
         * A generation cannot have duplicate
         * model-year records.
         */
        unique(
            "vehicle_model_years_generation_year_unique",
        ).on(
            table.generationId,
            table.year,
        ),

        /**
         * Efficient retrieval of model years
         * belonging to a generation.
         */
        index(
            "vehicle_model_years_generation_idx",
        ).on(
            table.generationId,
        ),

        /**
         * Supports generation-specific year
         * selection, including active filtering.
         */
        index(
            "vehicle_model_years_lookup_idx",
        ).on(
            table.generationId,
            table.active,
            table.year,
        ),

        /**
         * Supports Nigerian-market filtering.
         */
        index(
            "vehicle_model_years_market_idx",
        ).on(
            table.nigeriaMarket,
            table.active,
        ),

        /**
         * Prevents impossible model-year values.
         */
        check(
            "vehicle_model_years_year_check",
            sql`
                year >= 1886
                AND year <= 2100
            `,
        ),
    ],
);