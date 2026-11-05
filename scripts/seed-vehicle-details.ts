import {
    and,
    eq,
} from "drizzle-orm";

import { db } from "../src/database/index.ts";

import {
    vehicleMakes,
    vehicleModels,
    vehicleGenerations,
    vehicleEngines,
    vehicleVariants,
    vehicleModelYears,
    vehicleModelYearVariants,

    vehicleMarkets,
    vehicleMakeMarkets,
    vehicleModelMarkets,
    vehicleGenerationMarkets,
    vehicleEngineMarkets,
    vehicleModelYearMarkets,
    vehicleVariantMarkets,
} from "../src/database/schema/index.ts";

/**
 * KARMASS VEHICLE DETAILS SEED
 *
 * Populates:
 *
 * 1. Vehicle generations
 * 2. Vehicle engines
 * 3. Vehicle variants
 * 4. Vehicle model years
 * 5. Model-year/variant associations
 * 6. Vehicle markets
 * 7. Make market associations
 * 8. Model market associations
 * 9. Generation market associations
 * 10. Engine market associations
 * 11. Model-year market associations
 * 12. Variant market associations
 *
 * FEATURES:
 *
 * - Idempotent
 * - Updates existing catalog records
 * - Preserves existing record IDs
 * - Does not delete existing records
 * - Does not duplicate market associations
 * - Validates composite relationships
 *
 * IMPORTANT:
 *
 * This is a curated initial catalog.
 * It is not a complete global vehicle specification database.
 */

/**
 * SUPPORTED MARKET SEED
 *
 * Nigeria is the initial market.
 *
 * Additional markets should only be associated with
 * vehicle configurations after their availability
 * has been verified.
 */

const initialMarkets = [
    {
        countryCode: "NG",
        name: "Nigeria",
        currencyCode: "NGN",
    },
] as const;

/**
 * VEHICLE TYPES
 */

type FuelType =
    | "PETROL"
    | "DIESEL"
    | "HYBRID"
    | "PLUG_IN_HYBRID"
    | "ELECTRIC"
    | "CNG"
    | "LPG";

type Transmission =
    | "MANUAL"
    | "AUTOMATIC"
    | "CVT"
    | "DCT"
    | "AMT";

type DriveType =
    | "FWD"
    | "RWD"
    | "AWD"
    | "FOUR_WD";

type BodyStyle =
    | "SEDAN"
    | "SUV"
    | "COUPE"
    | "HATCHBACK"
    | "WAGON"
    | "MPV"
    | "PICKUP"
    | "VAN"
    | "CONVERTIBLE"
    | "TRUCK"
    | "BUS";

type VehicleSeed = {
    make: string;
    model: string;

    generations: Array<{
        name: string;
        startYear: number;
        endYear: number;

        engines: Array<{
            name: string;
            slug: string;
            displacementCc: number | null;
            cylinders: number | null;
            horsepower: number | null;

            fuelType: FuelType;
            transmission: Transmission;
            driveType: DriveType;

            variants: Array<{
                name: string;
                slug: string;
                bodyStyle: BodyStyle;
                seats: number;
                doors: number;
            }>;
        }>;
    }>;
};

/**
 * INITIAL CURATED VEHICLE DATA
 *
 * Add additional configurations here as the catalog
 * is verified and expanded.
 *
 * Do not add engine/variant combinations unless
 * the configuration is applicable to the generation.
 */

const vehicleCatalog: VehicleSeed[] = [
    {
        make: "Toyota",
        model: "Camry",

        generations: [
            {
                name: "XV70",
                startYear: 2018,
                endYear: 2024,

                engines: [
                    {
                        name: "2.5L Dynamic Force",
                        slug: "2-5l-dynamic-force",
                        displacementCc: 2487,
                        cylinders: 4,
                        horsepower: null,
                        fuelType: "PETROL",
                        transmission: "AUTOMATIC",
                        driveType: "FWD",

                        variants: [
                            {
                                name: "2.5L LE",
                                slug: "2-5l-le",
                                bodyStyle: "SEDAN",
                                seats: 5,
                                doors: 4,
                            },
                            {
                                name: "2.5L SE",
                                slug: "2-5l-se",
                                bodyStyle: "SEDAN",
                                seats: 5,
                                doors: 4,
                            },
                            {
                                name: "2.5L XLE",
                                slug: "2-5l-xle",
                                bodyStyle: "SEDAN",
                                seats: 5,
                                doors: 4,
                            },
                        ],
                    },
                ],
            },
        ],
    },

    {
        make: "Toyota",
        model: "Corolla",

        generations: [
            {
                name: "E210",
                startYear: 2019,
                endYear: 2026,

                engines: [
                    {
                        name: "1.8L Petrol",
                        slug: "1-8l-petrol",
                        displacementCc: 1798,
                        cylinders: 4,
                        horsepower: null,
                        fuelType: "PETROL",
                        transmission: "CVT",
                        driveType: "FWD",

                        variants: [
                            {
                                name: "1.8L L",
                                slug: "1-8l-l",
                                bodyStyle: "SEDAN",
                                seats: 5,
                                doors: 4,
                            },
                            {
                                name: "1.8L LE",
                                slug: "1-8l-le",
                                bodyStyle: "SEDAN",
                                seats: 5,
                                doors: 4,
                            },
                            {
                                name: "1.8L SE",
                                slug: "1-8l-se",
                                bodyStyle: "SEDAN",
                                seats: 5,
                                doors: 4,
                            },
                        ],
                    },
                ],
            },
        ],
    },

    {
        make: "Honda",
        model: "Accord",

        generations: [
            {
                name: "Tenth Generation",
                startYear: 2018,
                endYear: 2022,

                engines: [
                    {
                        name: "1.5L Turbo",
                        slug: "1-5l-turbo",
                        displacementCc: 1498,
                        cylinders: 4,
                        horsepower: null,
                        fuelType: "PETROL",
                        transmission: "CVT",
                        driveType: "FWD",

                        variants: [
                            {
                                name: "1.5T LX",
                                slug: "1-5t-lx",
                                bodyStyle: "SEDAN",
                                seats: 5,
                                doors: 4,
                            },
                            {
                                name: "1.5T Sport",
                                slug: "1-5t-sport",
                                bodyStyle: "SEDAN",
                                seats: 5,
                                doors: 4,
                            },
                            {
                                name: "1.5T EX-L",
                                slug: "1-5t-ex-l",
                                bodyStyle: "SEDAN",
                                seats: 5,
                                doors: 4,
                            },
                        ],
                    },
                ],
            },
        ],
    },

    {
        make: "Honda",
        model: "Civic",

        generations: [
            {
                name: "Eleventh Generation",
                startYear: 2022,
                endYear: 2026,

                engines: [
                    {
                        name: "2.0L Petrol",
                        slug: "2-0l-petrol",
                        displacementCc: 1996,
                        cylinders: 4,
                        horsepower: null,
                        fuelType: "PETROL",
                        transmission: "CVT",
                        driveType: "FWD",

                        variants: [
                            {
                                name: "2.0L LX",
                                slug: "2-0l-lx",
                                bodyStyle: "SEDAN",
                                seats: 5,
                                doors: 4,
                            },
                            {
                                name: "2.0L Sport",
                                slug: "2-0l-sport",
                                bodyStyle: "SEDAN",
                                seats: 5,
                                doors: 4,
                            },
                        ],
                    },
                ],
            },
        ],
    },

    {
        make: "Lexus",
        model: "RX",

        generations: [
            {
                name: "AL20",
                startYear: 2016,
                endYear: 2022,

                engines: [
                    {
                        name: "3.5L V6",
                        slug: "3-5l-v6",
                        displacementCc: 3456,
                        cylinders: 6,
                        horsepower: null,
                        fuelType: "PETROL",
                        transmission: "AUTOMATIC",
                        driveType: "AWD",

                        variants: [
                            {
                                name: "RX 350",
                                slug: "rx-350",
                                bodyStyle: "SUV",
                                seats: 5,
                                doors: 4,
                            },
                        ],
                    },
                ],
            },
        ],
    },

    {
        make: "Mercedes-Benz",
        model: "C-Class",

        generations: [
            {
                name: "W205",
                startYear: 2015,
                endYear: 2021,

                engines: [
                    {
                        name: "2.0L Turbo Petrol",
                        slug: "2-0l-turbo-petrol",
                        displacementCc: 1991,
                        cylinders: 4,
                        horsepower: null,
                        fuelType: "PETROL",
                        transmission: "AUTOMATIC",
                        driveType: "RWD",

                        variants: [
                            {
                                name: "C200",
                                slug: "c200",
                                bodyStyle: "SEDAN",
                                seats: 5,
                                doors: 4,
                            },
                            {
                                name: "C300",
                                slug: "c300",
                                bodyStyle: "SEDAN",
                                seats: 5,
                                doors: 4,
                            },
                        ],
                    },
                ],
            },
        ],
    },

    {
        make: "BMW",
        model: "3 Series",

        generations: [
            {
                name: "G20",
                startYear: 2019,
                endYear: 2026,

                engines: [
                    {
                        name: "2.0L Turbo Petrol",
                        slug: "2-0l-turbo-petrol",
                        displacementCc: 1998,
                        cylinders: 4,
                        horsepower: null,
                        fuelType: "PETROL",
                        transmission: "AUTOMATIC",
                        driveType: "RWD",

                        variants: [
                            {
                                name: "320i",
                                slug: "320i",
                                bodyStyle: "SEDAN",
                                seats: 5,
                                doors: 4,
                            },
                            {
                                name: "330i",
                                slug: "330i",
                                bodyStyle: "SEDAN",
                                seats: 5,
                                doors: 4,
                            },
                        ],
                    },
                ],
            },
        ],
    },
];

/**
 * TYPES
 */

type VehicleMake = typeof vehicleMakes.$inferSelect;
type VehicleModel = typeof vehicleModels.$inferSelect;
type VehicleGeneration = typeof vehicleGenerations.$inferSelect;
type VehicleEngine = typeof vehicleEngines.$inferSelect;
type VehicleVariant = typeof vehicleVariants.$inferSelect;
type VehicleModelYear = typeof vehicleModelYears.$inferSelect;
type VehicleMarket = typeof vehicleMarkets.$inferSelect;

/**
 * COUNTERS
 */

const counters = {
    markets: 0,
    makes: 0,
    models: 0,
    generations: 0,
    engines: 0,
    modelYears: 0,
    variants: 0,
    yearVariantAssociations: 0,
    marketAssociations: 0,
};

/**
 * HELPERS
 */

function slugify(value: string): string {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/**
 * SEED MARKETS
 */

async function seedMarkets(): Promise<VehicleMarket[]> {
    const results: VehicleMarket[] = [];

    for (const market of initialMarkets) {
        const [saved] = await db
            .insert(vehicleMarkets)
            .values({
                countryCode: market.countryCode,
                name: market.name,
                currencyCode: market.currencyCode,
                active: true,
            })
            .onConflictDoUpdate({
                target: vehicleMarkets.countryCode,
                set: {
                    name: market.name,
                    currencyCode: market.currencyCode,
                    active: true,
                    updatedAt: new Date(),
                },
            })
            .returning();

        if (!saved) {
            throw new Error(
                `Failed to seed market: ${market.name}`,
            );
        }

        results.push(saved);
        counters.markets++;
    }

    return results;
}

/**
 * FIND VEHICLE MAKE AND MODEL
 */

async function findVehicle(
    makeName: string,
    modelName: string,
): Promise<{
    make: VehicleMake;
    model: VehicleModel;
} | null> {
    const [make] = await db
        .select()
        .from(vehicleMakes)
        .where(
            and(
                eq(vehicleMakes.name, makeName),
                eq(vehicleMakes.active, true),
            ),
        )
        .limit(1);

    if (!make) {
        console.warn(
            `[SKIP] Make not found: ${makeName}`,
        );

        return null;
    }

    const [model] = await db
        .select()
        .from(vehicleModels)
        .where(
            and(
                eq(vehicleModels.makeId, make.id),
                eq(vehicleModels.name, modelName),
                eq(vehicleModels.active, true),
            ),
        )
        .limit(1);

    if (!model) {
        console.warn(
            `[SKIP] Model not found: ${makeName} ${modelName}`,
        );

        return null;
    }

    return {
        make,
        model,
    };
}

/**
 * MARKET ASSOCIATION HELPER
 *
 * Uses ON CONFLICT DO NOTHING so existing associations
 * are preserved and duplicate associations are avoided.
 */

async function associateMakeWithMarket(
    makeId: string,
    marketId: string,
) {
    const result = await db
        .insert(vehicleMakeMarkets)
        .values({
            makeId,
            marketId,
        })
        .onConflictDoNothing({
            target: [
                vehicleMakeMarkets.makeId,
                vehicleMakeMarkets.marketId,
            ],
        })
        .returning();

    counters.marketAssociations += result.length;
}

async function associateModelWithMarket(
    modelId: string,
    marketId: string,
) {
    const result = await db
        .insert(vehicleModelMarkets)
        .values({
            modelId,
            marketId,
        })
        .onConflictDoNothing({
            target: [
                vehicleModelMarkets.modelId,
                vehicleModelMarkets.marketId,
            ],
        })
        .returning();

    counters.marketAssociations += result.length;
}

async function associateGenerationWithMarket(
    generationId: string,
    marketId: string,
) {
    const result = await db
        .insert(vehicleGenerationMarkets)
        .values({
            generationId,
            marketId,
        })
        .onConflictDoNothing({
            target: [
                vehicleGenerationMarkets.generationId,
                vehicleGenerationMarkets.marketId,
            ],
        })
        .returning();

    counters.marketAssociations += result.length;
}

async function associateEngineWithMarket(
    engineId: string,
    marketId: string,
) {
    const result = await db
        .insert(vehicleEngineMarkets)
        .values({
            engineId,
            marketId,
        })
        .onConflictDoNothing({
            target: [
                vehicleEngineMarkets.engineId,
                vehicleEngineMarkets.marketId,
            ],
        })
        .returning();

    counters.marketAssociations += result.length;
}

async function associateModelYearWithMarket(
    modelYearId: string,
    marketId: string,
) {
    const result = await db
        .insert(vehicleModelYearMarkets)
        .values({
            modelYearId,
            marketId,
        })
        .onConflictDoNothing({
            target: [
                vehicleModelYearMarkets.modelYearId,
                vehicleModelYearMarkets.marketId,
            ],
        })
        .returning();

    counters.marketAssociations += result.length;
}

async function associateVariantWithMarket(
    variantId: string,
    marketId: string,
) {
    const result = await db
        .insert(vehicleVariantMarkets)
        .values({
            variantId,
            marketId,
        })
        .onConflictDoNothing({
            target: [
                vehicleVariantMarkets.variantId,
                vehicleVariantMarkets.marketId,
            ],
        })
        .returning();

    counters.marketAssociations += result.length;
}

/**
 * SEED GENERATIONS
 */

async function seedGeneration(
    modelId: string,
    generation: VehicleSeed["generations"][number],
): Promise<VehicleGeneration> {
    const [saved] = await db
        .insert(vehicleGenerations)
        .values({
            modelId,
            name: generation.name,
            slug: slugify(generation.name),
            startYear: generation.startYear,
            endYear: generation.endYear,
            aliases: [],
            nigeriaMarket: true,
            active: true,
        })
        .onConflictDoUpdate({
            target: [
                vehicleGenerations.modelId,
                vehicleGenerations.name,
            ],
            set: {
                slug: slugify(generation.name),
                startYear: generation.startYear,
                endYear: generation.endYear,
                active: true,
                updatedAt: new Date(),
            },
        })
        .returning();

    if (!saved) {
        throw new Error(
            `Failed to seed generation: ${generation.name}`,
        );
    }

    counters.generations++;

    return saved;
}

/**
 * SEED ENGINES
 */

async function seedEngine(
    modelId: string,
    engine: VehicleSeed["generations"][number]["engines"][number],
): Promise<VehicleEngine> {
    const [saved] = await db
        .insert(vehicleEngines)
        .values({
            modelId,
            name: engine.name,
            slug: engine.slug,
            displacementCc: engine.displacementCc,
            cylinders: engine.cylinders,
            horsepower: engine.horsepower,
            aliases: [],
            nigeriaMarket: true,
            active: true,
        })
        .onConflictDoUpdate({
            target: [
                vehicleEngines.modelId,
                vehicleEngines.slug,
            ],
            set: {
                name: engine.name,
                displacementCc: engine.displacementCc,
                cylinders: engine.cylinders,
                horsepower: engine.horsepower,
                active: true,
                updatedAt: new Date(),
            },
        })
        .returning();

    if (!saved) {
        throw new Error(
            `Failed to seed engine: ${engine.name}`,
        );
    }

    counters.engines++;

    return saved;
}

/**
 * SEED VARIANTS
 */

async function seedVariant(
    modelId: string,
    generationId: string,
    engineId: string,
    year: number,
    engine: VehicleSeed["generations"][number]["engines"][number],
    variant: VehicleSeed["generations"][number]["engines"][number]["variants"][number],
): Promise<VehicleVariant> {
    const [saved] = await db
        .insert(vehicleVariants)
        .values({
            modelId,
            generationId,
            engineId,
            year,

            name: variant.name,
            slug: variant.slug,

            engineName: engine.name,
            engineDisplacementCc: engine.displacementCc,
            cylinders: engine.cylinders,
            horsepower: engine.horsepower,

            fuelType: engine.fuelType,
            transmission: engine.transmission,
            driveType: engine.driveType,

            bodyStyle: variant.bodyStyle,
            seats: variant.seats,
            doors: variant.doors,

            aliases: [],
            nigeriaMarket: true,
            active: true,
        })
        .onConflictDoUpdate({
            target: [
                vehicleVariants.generationId,
                vehicleVariants.year,
                vehicleVariants.slug,
            ],
            set: {
                modelId,
                engineId,

                name: variant.name,

                engineName: engine.name,
                engineDisplacementCc: engine.displacementCc,
                cylinders: engine.cylinders,
                horsepower: engine.horsepower,

                fuelType: engine.fuelType,
                transmission: engine.transmission,
                driveType: engine.driveType,

                bodyStyle: variant.bodyStyle,
                seats: variant.seats,
                doors: variant.doors,

                active: true,
                updatedAt: new Date(),
            },
        })
        .returning();

    if (!saved) {
        throw new Error(
            `Failed to seed variant: ${variant.name} (${year})`,
        );
    }

    counters.variants++;

    return saved;
}

/**
 * SEED MODEL YEARS
 */

async function seedModelYear(
    generationId: string,
    year: number,
): Promise<VehicleModelYear> {
    const [saved] = await db
        .insert(vehicleModelYears)
        .values({
            generationId,
            year,
            nigeriaMarket: true,
            active: true,
        })
        .onConflictDoUpdate({
            target: [
                vehicleModelYears.generationId,
                vehicleModelYears.year,
            ],
            set: {
                active: true,
                updatedAt: new Date(),
            },
        })
        .returning();

    if (!saved) {
        throw new Error(
            `Failed to seed model year: ${year}`,
        );
    }

    counters.modelYears++;

    return saved;
}

/**
 * LINK MODEL YEARS TO VARIANTS
 *
 * The composite relationship requires:
 *
 * modelYearId
 * variantId
 * generationId
 * year
 *
 * Both records must belong to the same generation
 * and the same model year.
 */

async function linkModelYearVariant(
    modelYear: VehicleModelYear,
    variant: VehicleVariant,
) {
    if (
        modelYear.generationId !== variant.generationId ||
        modelYear.year !== variant.year
    ) {
        throw new Error(
            [
                "Invalid model-year/variant relationship.",
                `Model year: ${modelYear.year}`,
                `Variant: ${variant.name}`,
                `Variant year: ${variant.year}`,
            ].join(" "),
        );
    }

    const [saved] = await db
        .insert(vehicleModelYearVariants)
        .values({
            modelYearId: modelYear.id,
            variantId: variant.id,
            generationId: modelYear.generationId,
            year: modelYear.year,
        })
        .onConflictDoNothing({
            target: [
                vehicleModelYearVariants.modelYearId,
                vehicleModelYearVariants.variantId,
            ],
        })
        .returning();

    if (saved) {
        counters.yearVariantAssociations++;
    }
}

/**
 * MAIN SEED
 */

async function seedVehicleDetails() {
    console.log(
        "\nStarting KARMASS vehicle details seed...\n",
    );

    /**
     * 1. Seed supported markets.
     */

    const markets = await seedMarkets();

    const nigeriaMarket = markets.find(
        (market) => market.countryCode === "NG",
    );

    if (!nigeriaMarket) {
        throw new Error(
            "Nigeria market was not initialized.",
        );
    }

    /**
     * 2. Process vehicle catalog.
     */

    for (const vehicle of vehicleCatalog) {
        const vehicleRecords = await findVehicle(
            vehicle.make,
            vehicle.model,
        );

        if (!vehicleRecords) {
            continue;
        }

        const {
            make,
            model,
        } = vehicleRecords;

        console.log(
            `Processing ${vehicle.make} ${vehicle.model}`,
        );

        /**
         * Associate make and model with Nigeria.
         */

        await associateMakeWithMarket(
            make.id,
            nigeriaMarket.id,
        );

        await associateModelWithMarket(
            model.id,
            nigeriaMarket.id,
        );

        /**
         * Process generations.
         */

        for (const generationData of vehicle.generations) {
            const generation = await seedGeneration(
                model.id,
                generationData,
            );

            await associateGenerationWithMarket(
                generation.id,
                nigeriaMarket.id,
            );

            /**
             * Process engines once per generation.
             *
             * Engines are model-level records.
             */

            for (const engineData of generationData.engines) {
                const engine = await seedEngine(
                    model.id,
                    engineData,
                );

                await associateEngineWithMarket(
                    engine.id,
                    nigeriaMarket.id,
                );

                /**
                 * Process model years.
                 */

                for (
                    let year = generationData.startYear;
                    year <= generationData.endYear;
                    year++
                ) {
                    const modelYear = await seedModelYear(
                        generation.id,
                        year,
                    );

                    await associateModelYearWithMarket(
                        modelYear.id,
                        nigeriaMarket.id,
                    );

                    /**
                     * Process variants.
                     */

                    for (const variantData of engineData.variants) {
                        const variant = await seedVariant(
                            model.id,
                            generation.id,
                            engine.id,
                            year,
                            engineData,
                            variantData,
                        );

                        await associateVariantWithMarket(
                            variant.id,
                            nigeriaMarket.id,
                        );

                        /**
                         * Link model year and variant.
                         */

                        await linkModelYearVariant(
                            modelYear,
                            variant,
                        );
                    }
                }
            }
        }
    }

    /**
     * 3. Print results.
     */

    console.log(
        "\nKARMASS vehicle details seed completed successfully.\n",
    );

    console.table({
        marketsProcessed: counters.markets,
        generationsProcessed: counters.generations,
        enginesProcessed: counters.engines,
        modelYearsProcessed: counters.modelYears,
        variantsProcessed: counters.variants,
        newYearVariantAssociations:
            counters.yearVariantAssociations,
        newMarketAssociations:
            counters.marketAssociations,
    });

    console.log(
        "\nNote: Processed counts include records updated through upserts.",
    );

    console.log(
        "Existing records and IDs have been preserved.",
    );
}

/**
 * EXECUTION
 */

seedVehicleDetails()
    .catch((error: unknown) => {
        console.error(
            "\nVehicle details seeding failed:",
            error,
        );

        process.exitCode = 1;
    });