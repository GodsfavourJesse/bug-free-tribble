import {
    boolean,
    check,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    timestamp,
    unique,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { vehicleEngines } from "./vehicle-engine.ts";
import { vehicleGenerations } from "./vehicles.ts";

export const vehicleFuelTypeEnum =
    pgEnum(
        "vehicle_fuel_type",
        [
            "PETROL",
            "DIESEL",
            "HYBRID",
            "PLUG_IN_HYBRID",
            "ELECTRIC",
            "CNG",
            "LPG",
        ],
    );

export const vehicleTransmissionEnum =
    pgEnum(
        "vehicle_transmission",
        [
            "MANUAL",
            "AUTOMATIC",
            "CVT",
            "DCT",
            "AMT",
        ],
    );

export const vehicleDriveTypeEnum =
    pgEnum(
        "vehicle_drive_type",
        [
            "FWD",
            "RWD",
            "AWD",
            "FOUR_WD",
        ],
    );

export const vehicleBodyStyleEnum =
    pgEnum(
        "vehicle_body_style",
        [
            "SEDAN",
            "SUV",
            "COUPE",
            "HATCHBACK",
            "WAGON",
            "MPV",
            "PICKUP",
            "VAN",
            "CONVERTIBLE",
            "TRUCK",
            "BUS",
        ],
    );

export const vehicleVariants =
    pgTable(
        "vehicle_variants",
        {
            id: uuid("id")
                .defaultRandom()
                .primaryKey(),

            generationId: uuid(
                "generation_id",
            )
                .notNull()
                .references(
                    () =>
                        vehicleGenerations.id,
                    {
                        onDelete: "restrict",
                    },
                ),

            /**
             * First-class engine reference.
             *
             * A variant may temporarily have no
             * engine while catalog data is being
             * imported or migrated.
             */
            engineId: uuid("engine_id")
                .references(
                    () =>
                        vehicleEngines.id,
                    {
                        onDelete: "restrict",
                    },
                ),

            year: integer("year")
                .notNull(),

            name: varchar("name", {
                length: 200,
            })
                .notNull(),

            slug: varchar("slug", {
                length: 220,
            })
                .notNull(),

            /**
             * Legacy engine name.
             *
             * Kept temporarily while existing
             * catalog data is migrated to engineId.
             */
            engineName: varchar(
                "engine_name",
                {
                    length: 150,
                },
            ),

            /**
             * Legacy engine displacement.
             *
             * Kept temporarily for migration
             * compatibility.
             */
            engineDisplacementCc:
                integer(
                    "engine_displacement_cc",
                ),

            /**
             * Legacy engine cylinder count.
             *
             * Kept temporarily for migration
             * compatibility.
             */
            cylinders: integer(
                "cylinders",
            ),

            /**
             * Legacy horsepower value.
             *
             * Kept temporarily for migration
             * compatibility.
             */
            horsepower: integer(
                "horsepower",
            ),

            fuelType:
                vehicleFuelTypeEnum(
                    "fuel_type",
                ),

            transmission:
                vehicleTransmissionEnum(
                    "transmission",
                ),

            driveType:
                vehicleDriveTypeEnum(
                    "drive_type",
                ),

            bodyStyle:
                vehicleBodyStyleEnum(
                    "body_style",
                ),

            seats: integer("seats"),

            doors: integer("doors"),

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
                "vehicle_variants_generation_year_slug_unique",
            ).on(
                table.generationId,
                table.year,
                table.slug,
            ),

            unique(
                "vehicle_variants_generation_year_name_unique",
            ).on(
                table.generationId,
                table.year,
                table.name,
            ),

            index(
                "vehicle_variants_generation_idx",
            ).on(
                table.generationId,
            ),

            index(
                "vehicle_variants_engine_idx",
            ).on(
                table.engineId,
            ),

            index(
                "vehicle_variants_year_idx",
            ).on(
                table.year,
            ),

            index(
                "vehicle_variants_active_idx",
            ).on(
                table.generationId,
                table.active,
            ),

            index(
                "vehicle_variants_market_idx",
            ).on(
                table.nigeriaMarket,
                table.active,
            ),

            index(
                "vehicle_variants_fuel_idx",
            ).on(
                table.fuelType,
            ),

            index(
                "vehicle_variants_transmission_idx",
            ).on(
                table.transmission,
            ),

            index(
                "vehicle_variants_body_idx",
            ).on(
                table.bodyStyle,
            ),

            check(
                "vehicle_variants_year_check",
                sql`
                    year >= 1886
                    AND year <= 2100
                `,
            ),

            check(
                "vehicle_variants_engine_displacement_check",
                sql`
                    engine_displacement_cc IS NULL
                    OR engine_displacement_cc > 0
                `,
            ),

            check(
                "vehicle_variants_cylinders_check",
                sql`
                    cylinders IS NULL
                    OR cylinders > 0
                `,
            ),

            check(
                "vehicle_variants_horsepower_check",
                sql`
                    horsepower IS NULL
                    OR horsepower > 0
                `,
            ),

            check(
                "vehicle_variants_seats_check",
                sql`
                    seats IS NULL
                    OR seats > 0
                `,
            ),

            check(
                "vehicle_variants_doors_check",
                sql`
                    doors IS NULL
                    OR doors > 0
                `,
            ),
        ],
    );