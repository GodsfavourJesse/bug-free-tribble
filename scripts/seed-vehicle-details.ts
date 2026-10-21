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
} from "../src/database/schema/index.ts";

/**
 * KARMASS VEHICLE DETAILS SEED
 *
 * Populates:
 * 1. Vehicle generations
 * 2. Vehicle engines
 * 3. Vehicle variants
 * 4. Vehicle model years
 * 5. Model-year/variant associations
 *
 * The script is idempotent:
 * running it repeatedly does not create duplicate
 * records for the catalog entries defined below.
 *
 * IMPORTANT:
 * This is a curated initial catalog, not a complete
 * specification database for every vehicle worldwide.
 */

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

            fuelType:
                | "PETROL"
                | "DIESEL"
                | "HYBRID"
                | "PLUG_IN_HYBRID"
                | "ELECTRIC"
                | "CNG"
                | "LPG";

            transmission:
                | "MANUAL"
                | "AUTOMATIC"
                | "CVT"
                | "DCT"
                | "AMT";

            driveType:
                | "FWD"
                | "RWD"
                | "AWD"
                | "FOUR_WD";

            variants: Array<{
                name: string;
                slug: string;
                bodyStyle:
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
 * Do not add an engine/variant combination unless
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
 * HELPERS
 */

function slugify(value: string): string {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

async function findModel(
    makeName: string,
    modelName: string,
) {
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

    return model;
}

/**
 * SEED GENERATIONS
 */

async function seedGeneration(
    modelId: string,
    generation: VehicleSeed["generations"][number],
) {
    const [existing] = await db
        .select()
        .from(vehicleGenerations)
        .where(
            and(
                eq(vehicleGenerations.modelId, modelId),
                eq(vehicleGenerations.name, generation.name),
            ),
        )
        .limit(1);

    if (existing) {
        return existing;
    }

    const [created] = await db
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
        .returning();

    return created;
}

/**
 * SEED ENGINES
 */

async function seedEngine(
    modelId: string,
    engine: VehicleSeed["generations"][number]["engines"][number],
) {
    const [existing] = await db
        .select()
        .from(vehicleEngines)
        .where(
            and(
                eq(vehicleEngines.modelId, modelId),
                eq(vehicleEngines.slug, engine.slug),
            ),
        )
        .limit(1);

    if (existing) {
        return existing;
    }

    const [created] = await db
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
        .returning();

    return created;
}

/**
 * SEED VARIANTS
 */

async function seedVariant(
    generationId: string,
    engineId: string,
    year: number,
    engine: VehicleSeed["generations"][number]["engines"][number],
    variant: VehicleSeed["generations"][number]["engines"][number]["variants"][number],
) {
    const [existing] = await db
        .select()
        .from(vehicleVariants)
        .where(
            and(
                eq(vehicleVariants.generationId, generationId),
                eq(vehicleVariants.year, year),
                eq(vehicleVariants.slug, variant.slug),
            ),
        )
        .limit(1);

    if (existing) {
        return existing;
    }

    const [created] = await db
        .insert(vehicleVariants)
        .values({
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
        .returning();

    return created;
}

/**
 * SEED MODEL YEARS
 */

async function seedModelYear(
    generationId: string,
    year: number,
) {
    const [existing] = await db
        .select()
        .from(vehicleModelYears)
        .where(
            and(
                eq(vehicleModelYears.generationId, generationId),
                eq(vehicleModelYears.year, year),
            ),
        )
        .limit(1);

    if (existing) {
        return existing;
    }

    const [created] = await db
        .insert(vehicleModelYears)
        .values({
            generationId,
            year,
            nigeriaMarket: true,
            active: true,
        })
        .returning();

    return created;
}

/**
 * LINK MODEL YEARS TO VARIANTS
 */

async function linkModelYearVariant(
    modelYearId: string,
    variantId: string,
) {
    const [existing] = await db
        .select()
        .from(vehicleModelYearVariants)
        .where(
            and(
                eq(
                    vehicleModelYearVariants.modelYearId,
                    modelYearId,
                ),
                eq(
                    vehicleModelYearVariants.variantId,
                    variantId,
                ),
            ),
        )
        .limit(1);

    if (existing) {
        return;
    }

    await db
        .insert(vehicleModelYearVariants)
        .values({
            modelYearId,
            variantId,
        });
}

/**
 * MAIN SEED
 */

async function seedVehicleDetails() {
    let generationsCount = 0;
    let enginesCount = 0;
    let variantsCount = 0;
    let yearsCount = 0;
    let linksCount = 0;

    console.log(
        "Starting KARMASS vehicle details seed...",
    );

    for (const vehicle of vehicleCatalog) {
        const model = await findModel(
            vehicle.make,
            vehicle.model,
        );

        if (!model) {
            continue;
        }

        console.log(
            `Processing ${vehicle.make} ${vehicle.model}`,
        );

        for (const generationData of vehicle.generations) {
            const generation = await seedGeneration(
                model.id,
                generationData,
            );

            generationsCount++;

            for (
                let year = generationData.startYear;
                year <= generationData.endYear;
                year++
            ) {
                const modelYear = await seedModelYear(
                    generation.id,
                    year,
                );

                yearsCount++;

                for (const engineData of generationData.engines) {
                    const engine = await seedEngine(
                        model.id,
                        engineData,
                    );

                    enginesCount++;

                    for (const variantData of engineData.variants) {
                        const variant = await seedVariant(
                            generation.id,
                            engine.id,
                            year,
                            engineData,
                            variantData,
                        );

                        variantsCount++;

                        await linkModelYearVariant(
                            modelYear.id,
                            variant.id,
                        );

                        linksCount++;
                    }
                }
            }
        }
    }

    console.log("\nKARMASS vehicle details seed completed.");

    console.table({
        generations: generationsCount,
        engines: enginesCount,
        modelYears: yearsCount,
        variants: variantsCount,
        yearVariantAssociations: linksCount,
    });
}

seedVehicleDetails()
    .catch((error: unknown) => {
        console.error(
            "Vehicle details seeding failed:",
            error,
        );

        process.exitCode = 1;
    });