import {
    boolean,
    index,
    pgTable,
    timestamp,
    unique,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import {
    vehicleMakes,
    vehicleModels,
    vehicleGenerations,
} from "./vehicles.ts";

import {
    vehicleEngines,
} from "./vehicle-engine.ts";

import {
    vehicleModelYears,
} from "./vehicle-model-years.ts";

import {
    vehicleVariants,
} from "./vehicle-variants.ts";

/**
 * VEHICLE MARKETS
 *
 * A market represents a country in which KARMASS
 * supports vehicle catalog availability.
 *
 * Examples:
 *
 * NG = Nigeria
 * US = United States
 * GB = United Kingdom
 * CA = Canada
 * DE = Germany
 * JP = Japan
 * AE = United Arab Emirates
 *
 * This table is the source of supported markets.
 */

export const vehicleMarkets = pgTable(
    "vehicle_markets",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        countryCode: varchar("country_code", {
            length: 2,
        })
            .notNull()
            .unique(),

        name: varchar("name", {
            length: 100,
        })
            .notNull()
            .unique(),

        currencyCode: varchar("currency_code", {
            length: 3,
        }),

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
        index("vehicle_markets_active_idx")
            .on(table.active),

        index("vehicle_markets_country_code_idx")
            .on(table.countryCode),
    ],
);

/**
 * MAKE MARKETS
 *
 * Countries where a manufacturer is supported.
 */

export const vehicleMakeMarkets = pgTable(
    "vehicle_make_markets",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        makeId: uuid("make_id")
            .notNull()
            .references(() => vehicleMakes.id, {
                onDelete: "restrict",
                onUpdate: "cascade",
            }),

        marketId: uuid("market_id")
            .notNull()
            .references(() => vehicleMarkets.id, {
                onDelete: "restrict",
                onUpdate: "cascade",
            }),

        createdAt: timestamp("created_at", {
            withTimezone: true,
        })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        unique("vehicle_make_markets_unique")
            .on(
                table.makeId,
                table.marketId,
            ),

        index("vehicle_make_markets_make_idx")
            .on(table.makeId),

        index("vehicle_make_markets_market_idx")
            .on(table.marketId),
    ],
);

/**
 * MODEL MARKETS
 *
 * Countries where a vehicle model is supported.
 */

export const vehicleModelMarkets = pgTable(
    "vehicle_model_markets",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        modelId: uuid("model_id")
            .notNull()
            .references(() => vehicleModels.id, {
                onDelete: "restrict",
                onUpdate: "cascade",
            }),

        marketId: uuid("market_id")
            .notNull()
            .references(() => vehicleMarkets.id, {
                onDelete: "restrict",
                onUpdate: "cascade",
            }),

        createdAt: timestamp("created_at", {
            withTimezone: true,
        })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        unique("vehicle_model_markets_unique")
            .on(
                table.modelId,
                table.marketId,
            ),

        index("vehicle_model_markets_model_idx")
            .on(table.modelId),

        index("vehicle_model_markets_market_idx")
            .on(table.marketId),
    ],
);

/**
 * GENERATION MARKETS
 *
 * Countries where a vehicle generation is available.
 */

export const vehicleGenerationMarkets = pgTable(
    "vehicle_generation_markets",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        generationId: uuid("generation_id")
            .notNull()
            .references(() => vehicleGenerations.id, {
                onDelete: "restrict",
                onUpdate: "cascade",
            }),

        marketId: uuid("market_id")
            .notNull()
            .references(() => vehicleMarkets.id, {
                onDelete: "restrict",
                onUpdate: "cascade",
            }),

        createdAt: timestamp("created_at", {
            withTimezone: true,
        })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        unique("vehicle_generation_markets_unique")
            .on(
                table.generationId,
                table.marketId,
            ),

        index("vehicle_generation_markets_generation_idx")
            .on(table.generationId),

        index("vehicle_generation_markets_market_idx")
            .on(table.marketId),
    ],
);

/**
 * ENGINE MARKETS
 *
 * Countries where an engine configuration is available.
 */

export const vehicleEngineMarkets = pgTable(
    "vehicle_engine_markets",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        engineId: uuid("engine_id")
            .notNull()
            .references(() => vehicleEngines.id, {
                onDelete: "restrict",
                onUpdate: "cascade",
            }),

        marketId: uuid("market_id")
            .notNull()
            .references(() => vehicleMarkets.id, {
                onDelete: "restrict",
                onUpdate: "cascade",
            }),

        createdAt: timestamp("created_at", {
            withTimezone: true,
        })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        unique("vehicle_engine_markets_unique")
            .on(
                table.engineId,
                table.marketId,
            ),

        index("vehicle_engine_markets_engine_idx")
            .on(table.engineId),

        index("vehicle_engine_markets_market_idx")
            .on(table.marketId),
    ],
);

/**
 * MODEL YEAR MARKETS
 *
 * Countries where a particular model year is available.
 */

export const vehicleModelYearMarkets = pgTable(
    "vehicle_model_year_markets",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        modelYearId: uuid("model_year_id")
            .notNull()
            .references(() => vehicleModelYears.id, {
                onDelete: "restrict",
                onUpdate: "cascade",
            }),

        marketId: uuid("market_id")
            .notNull()
            .references(() => vehicleMarkets.id, {
                onDelete: "restrict",
                onUpdate: "cascade",
            }),

        createdAt: timestamp("created_at", {
            withTimezone: true,
        })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        unique("vehicle_model_year_markets_unique")
            .on(
                table.modelYearId,
                table.marketId,
            ),

        index("vehicle_model_year_markets_model_year_idx")
            .on(table.modelYearId),

        index("vehicle_model_year_markets_market_idx")
            .on(table.marketId),
    ],
);

/**
 * VARIANT MARKETS
 *
 * Countries where a specific vehicle variant is available.
 */

export const vehicleVariantMarkets = pgTable(
    "vehicle_variant_markets",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        variantId: uuid("variant_id")
            .notNull()
            .references(() => vehicleVariants.id, {
                onDelete: "restrict",
                onUpdate: "cascade",
            }),

        marketId: uuid("market_id")
            .notNull()
            .references(() => vehicleMarkets.id, {
                onDelete: "restrict",
                onUpdate: "cascade",
            }),

        createdAt: timestamp("created_at", {
            withTimezone: true,
        })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        unique("vehicle_variant_markets_unique")
            .on(
                table.variantId,
                table.marketId,
            ),

        index("vehicle_variant_markets_variant_idx")
            .on(table.variantId),

        index("vehicle_variant_markets_market_idx")
            .on(table.marketId),
    ],
);