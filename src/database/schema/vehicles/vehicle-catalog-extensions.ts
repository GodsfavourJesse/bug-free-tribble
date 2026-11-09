import {
    boolean,
    check,
    foreignKey,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    real,
    text,
    timestamp,
    unique,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";

import { vehicleEngines } from "./vehicle-engine.ts";
import { vehicleVariants } from "./vehicle-variants.ts";

/* =========================================================
   ENUMS
========================================================= */

export const vehicleCatalogEntityTypeEnum = pgEnum(
    "vehicle_catalog_entity_type",
    [
        "MAKE",
        "MODEL",
        "GENERATION",
        "ENGINE",
        "VARIANT",
        "MODEL_YEAR",
    ],
);

export const vehicleCatalogSourceTypeEnum = pgEnum(
    "vehicle_catalog_source_type",
    [
        "MANUFACTURER",
        "GOVERNMENT",
        "TECHNICAL_DOCUMENT",
        "AUTOMOTIVE_PUBLICATION",
        "OTHER",
    ],
);

export const vehicleCatalogVerificationEnum = pgEnum(
    "vehicle_catalog_verification_status",
    [
        "PENDING",
        "VERIFIED",
        "DISPUTED",
        "REJECTED",
    ],
);

/* =========================================================
   ENGINE SPECIFICATIONS
========================================================= */

/**
 * Additional technical specifications for an engine.
 *
 * The existing vehicle_engines table remains the
 * primary engine identity table.
 *
 * This table stores detailed technical information
 * without disrupting existing marketplace queries.
 */

export const vehicleEngineSpecifications = pgTable(
    "vehicle_engine_specifications",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        engineId: uuid("engine_id")
            .notNull()
            .unique()
            .references(
                () => vehicleEngines.id,
                {
                    onDelete: "cascade",
                    onUpdate: "cascade",
                },
            ),

        engineCode: varchar("engine_code", {
            length: 100,
        }),

        configuration: varchar("configuration", {
            length: 100,
        }),

        cylinderLayout: varchar("cylinder_layout", {
            length: 50,
        }),

        valves: integer("valves"),

        valvesPerCylinder: integer(
            "valves_per_cylinder",
        ),

        valveTrain: varchar("valve_train", {
            length: 100,
        }),

        aspiration: varchar("aspiration", {
            length: 80,
        }),

        fuelSystem: varchar("fuel_system", {
            length: 120,
        }),

        powerKw: integer("power_kw"),

        powerRpm: integer("power_rpm"),

        torqueNm: integer("torque_nm"),

        torqueRpm: integer("torque_rpm"),

        compressionRatio: real(
            "compression_ratio",
        ),

        boreMm: real("bore_mm"),

        strokeMm: real("stroke_mm"),

        hybridSystem: varchar("hybrid_system", {
            length: 150,
        }),

        motorPowerKw: integer("motor_power_kw"),

        batteryCapacityKwh: real(
            "battery_capacity_kwh",
        ),

        electricRangeKm: integer(
            "electric_range_km",
        ),

        /**
         * Additional manufacturer specifications
         * that do not require dedicated columns.
         */
        additionalSpecifications: jsonb(
            "additional_specifications",
        )
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
    (table) => [
        index("vehicle_engine_specs_engine_idx")
            .on(table.engineId),

        check(
            "vehicle_engine_specs_power_check",
            sql`
                power_kw IS NULL OR power_kw > 0
            `,
        ),

        check(
            "vehicle_engine_specs_torque_check",
            sql`
                torque_nm IS NULL OR torque_nm > 0
            `,
        ),

        check(
            "vehicle_engine_specs_valves_check",
            sql`
                valves IS NULL OR valves > 0
            `,
        ),
    ],
);

/* =========================================================
   VARIANT SPECIFICATIONS
========================================================= */

/**
 * Detailed specifications for a particular vehicle
 * configuration / trim.
 *
 * Specifications are attached to variants because
 * dimensions, performance and equipment can differ
 * between trims and model years.
 */

export const vehicleVariantSpecifications = pgTable(
    "vehicle_variant_specifications",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        variantId: uuid("variant_id")
            .notNull()
            .unique()
            .references(
                () => vehicleVariants.id,
                {
                    onDelete: "cascade",
                    onUpdate: "cascade",
                },
            ),

        /* PERFORMANCE */

        topSpeedKph: integer("top_speed_kph"),

        acceleration0To100Seconds: real(
            "acceleration_0_to_100_seconds",
        ),

        /* FUEL ECONOMY */

        fuelConsumptionCityL100Km: real(
            "fuel_consumption_city_l100km",
        ),

        fuelConsumptionHighwayL100Km: real(
            "fuel_consumption_highway_l100km",
        ),

        fuelConsumptionCombinedL100Km: real(
            "fuel_consumption_combined_l100km",
        ),

        /* ELECTRIC VEHICLE */

        batteryCapacityKwh: real(
            "battery_capacity_kwh",
        ),

        electricRangeKm: integer(
            "electric_range_km",
        ),

        chargingPowerKw: real(
            "charging_power_kw",
        ),

        /* WEIGHT */

        curbWeightKg: integer("curb_weight_kg"),

        grossWeightKg: integer("gross_weight_kg"),

        towingCapacityKg: integer(
            "towing_capacity_kg",
        ),

        /* DIMENSIONS */

        lengthMm: integer("length_mm"),

        widthMm: integer("width_mm"),

        heightMm: integer("height_mm"),

        wheelbaseMm: integer("wheelbase_mm"),

        groundClearanceMm: integer(
            "ground_clearance_mm",
        ),

        /* CAPACITY */

        fuelTankCapacityLitres: real(
            "fuel_tank_capacity_litres",
        ),

        cargoCapacityLitres: integer(
            "cargo_capacity_litres",
        ),

        /* ADDITIONAL INFORMATION */

        tyreSizes: jsonb("tyre_sizes")
            .$type<string[]>()
            .notNull()
            .default([]),

        equipment: jsonb("equipment")
            .$type<string[]>()
            .notNull()
            .default([]),

        additionalSpecifications: jsonb(
            "additional_specifications",
        )
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
    (table) => [
        index("vehicle_variant_specs_variant_idx")
            .on(table.variantId),

        check(
            "vehicle_variant_specs_dimensions_check",
            sql`
                (length_mm IS NULL OR length_mm > 0)
                AND (width_mm IS NULL OR width_mm > 0)
                AND (height_mm IS NULL OR height_mm > 0)
                AND (wheelbase_mm IS NULL OR wheelbase_mm > 0)
            `,
        ),

        check(
            "vehicle_variant_specs_weight_check",
            sql`
                (curb_weight_kg IS NULL OR curb_weight_kg > 0)
                AND (gross_weight_kg IS NULL OR gross_weight_kg > 0)
            `,
        ),

        check(
            "vehicle_variant_specs_range_check",
            sql`
                electric_range_km IS NULL
                OR electric_range_km >= 0
            `,
        ),
    ],
);

/* =========================================================
   VEHICLE DATA SOURCES
========================================================= */

/**
 * Stores research source metadata.
 *
 * Examples:
 * Toyota official newsroom
 * Honda official technical brochure
 * NHTSA vehicle database
 *
 * A source can support multiple vehicle records.
 */

export const vehicleDataSources = pgTable(
    "vehicle_data_sources",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        name: varchar("name", {
            length: 200,
        })
            .notNull(),

        url: text("url")
            .notNull(),

        sourceType: vehicleCatalogSourceTypeEnum(
            "source_type",
        )
            .notNull(),

        licenseName: varchar("license_name", {
            length: 200,
        }),

        licenseUrl: text("license_url"),

        attributionRequired: boolean(
            "attribution_required",
        )
            .notNull()
            .default(false),

        attributionText: text(
            "attribution_text",
        ),

        reuseNotes: text("reuse_notes"),

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
        unique("vehicle_data_sources_name_url_unique")
            .on(
                table.name,
                table.url,
            ),

        index("vehicle_data_sources_type_idx")
            .on(table.sourceType),

        index("vehicle_data_sources_active_idx")
            .on(table.active),
    ],
);

/* =========================================================
   VEHICLE DATA SOURCE LINKS
========================================================= */

/**
 * Connects research sources to individual catalog records.
 *
 * entityId is polymorphic:
 *
 * MAKE       -> vehicle_makes.id
 * MODEL      -> vehicle_models.id
 * GENERATION -> vehicle_generations.id
 * ENGINE     -> vehicle_engines.id
 * VARIANT    -> vehicle_variants.id
 * MODEL_YEAR -> vehicle_model_years.id
 *
 * The importer must validate the entity exists before
 * creating a link because PostgreSQL cannot enforce a
 * normal foreign key across multiple target tables.
 */

export const vehicleDataSourceLinks = pgTable(
    "vehicle_data_source_links",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        sourceId: uuid("source_id")
            .notNull()
            .references(
                () => vehicleDataSources.id,
                {
                    onDelete: "restrict",
                    onUpdate: "cascade",
                },
            ),

        entityType: vehicleCatalogEntityTypeEnum(
            "entity_type",
        )
            .notNull(),

        entityId: uuid("entity_id")
            .notNull(),

        verificationStatus: vehicleCatalogVerificationEnum(
            "verification_status",
        )
            .notNull()
            .default("PENDING"),

        accessedAt: timestamp("accessed_at", {
            withTimezone: true,
        }),

        verifiedAt: timestamp("verified_at", {
            withTimezone: true,
        }),

        verificationNotes: text(
            "verification_notes",
        ),

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
        unique("vehicle_data_source_entity_unique")
            .on(
                table.sourceId,
                table.entityType,
                table.entityId,
            ),

        index("vehicle_data_source_entity_idx")
            .on(
                table.entityType,
                table.entityId,
            ),

        index("vehicle_data_source_status_idx")
            .on(table.verificationStatus),

        index("vehicle_data_source_source_idx")
            .on(table.sourceId),
    ],
);