import {
    check,
    foreignKey,
    index,
    pgTable,
    timestamp,
    unique,
    uuid,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";

import {
    vehicleModelYears,
} from "./vehicle-model-years.ts";

import {
    vehicleVariants,
} from "./vehicle-variants.ts";

/**
 * VEHICLE MODEL YEAR VARIANTS
 *
 * Connects model years to vehicle variants.
 *
 * A variant may be available for multiple model years,
 * and a model year may have multiple variants.
 *
 * Example:
 *
 * Toyota Camry XV70
 *   ├── 2020
 *   │   ├── 2.5L LE Automatic
 *   │   └── 2.5L SE Automatic
 *   └── 2021
 *       ├── 2.5L LE Automatic
 *       └── 2.5L XSE Automatic
 */
export const vehicleModelYearVariants = pgTable(
    "vehicle_model_year_variants",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        modelYearId: uuid("model_year_id")
            .notNull()
            .references(
                () => vehicleModelYears.id,
                {
                    onDelete: "restrict",
                    onUpdate: "cascade",
                },
            ),

        variantId: uuid("variant_id")
            .notNull()
            .references(
                () => vehicleVariants.id,
                {
                    onDelete: "restrict",
                    onUpdate: "cascade",
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
        /**
         * Prevent duplicate associations.
         */
        unique(
            "vehicle_model_year_variants_year_variant_unique",
        ).on(
            table.modelYearId,
            table.variantId,
        ),

        /**
         * Efficiently retrieve variants for a model year.
         */
        index(
            "vehicle_model_year_variants_model_year_idx",
        ).on(
            table.modelYearId,
        ),

        /**
         * Efficiently retrieve all model years
         * associated with a variant.
         */
        index(
            "vehicle_model_year_variants_variant_idx",
        ).on(
            table.variantId,
        ),
    ],
);