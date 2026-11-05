import {
    foreignKey,
    index,
    integer,
    pgTable,
    timestamp,
    unique,
    uuid,
} from "drizzle-orm/pg-core";

import {
    vehicleGenerations,
} from "./vehicles.ts";

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
 * Both records must belong to the same generation
 * and have the same model year.
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

        /**
         * Model year record being associated.
         */
        modelYearId: uuid("model_year_id")
            .notNull()
            .references(
                () => vehicleModelYears.id,
                {
                    onDelete: "restrict",
                    onUpdate: "cascade",
                },
            ),

        /**
         * Vehicle variant being associated.
         */
        variantId: uuid("variant_id")
            .notNull()
            .references(
                () => vehicleVariants.id,
                {
                    onDelete: "restrict",
                    onUpdate: "cascade",
                },
            ),

        /**
         * Generation shared by both records.
         *
         * This is enforced through composite
         * foreign-key constraints.
         */
        generationId: uuid("generation_id")
            .notNull()
            .references(
                () => vehicleGenerations.id,
                {
                    onDelete: "restrict",
                    onUpdate: "cascade",
                },
            ),

        /**
         * Model year shared by both records.
         */
        year: integer("year")
            .notNull(),

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
         * Ensure the model year belongs
         * to the specified generation and year.
         */
        foreignKey({
            name: "vehicle_model_year_variants_year_generation_fk",

            columns: [
                table.modelYearId,
                table.generationId,
                table.year,
            ],

            foreignColumns: [
                vehicleModelYears.id,
                vehicleModelYears.generationId,
                vehicleModelYears.year,
            ],
        }).onDelete("restrict")
          .onUpdate("cascade"),

        /**
         * Ensure the variant belongs
         * to the same generation and year.
         */
        foreignKey({
            name: "vehicle_model_year_variants_variant_generation_year_fk",

            columns: [
                table.variantId,
                table.generationId,
                table.year,
            ],

            foreignColumns: [
                vehicleVariants.id,
                vehicleVariants.generationId,
                vehicleVariants.year,
            ],
        }).onDelete("restrict")
          .onUpdate("cascade"),

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

        index(
            "vehicle_model_year_variants_generation_year_idx",
        ).on(
            table.generationId,
            table.year,
        ),
    ],
);