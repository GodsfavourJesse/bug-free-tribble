import { and, eq } from "drizzle-orm";

import {
    closeDatabase,
    db,
} from "../src/database/index.ts";

import {
    vehicleEngines,
    vehicleGenerations,
    vehicleMakes,
    vehicleModels,
    vehicleVariants,
} from "../src/database/schema/index.ts";

async function findMake(
    slug: string,
) {
    const rows = await db
        .select()
        .from(vehicleMakes)
        .where(
            eq(
                vehicleMakes.slug,
                slug,
            ),
        )
        .limit(1);

    return rows[0];
}

async function findModel(
    makeId: string,
    slug: string,
) {
    const rows = await db
        .select()
        .from(vehicleModels)
        .where(
            and(
                eq(
                    vehicleModels.makeId,
                    makeId,
                ),
                eq(
                    vehicleModels.slug,
                    slug,
                ),
            ),
        )
        .limit(1);

    return rows[0];
}

async function findGeneration(
    modelId: string,
    slug: string,
) {
    const rows = await db
        .select()
        .from(vehicleGenerations)
        .where(
            and(
                eq(
                    vehicleGenerations.modelId,
                    modelId,
                ),
                eq(
                    vehicleGenerations.slug,
                    slug,
                ),
            ),
        )
        .limit(1);

    return rows[0];
}

async function findEngine(
    modelId: string,
    slug: string,
) {
    const rows = await db
        .select()
        .from(vehicleEngines)
        .where(
            and(
                eq(
                    vehicleEngines.modelId,
                    modelId,
                ),
                eq(
                    vehicleEngines.slug,
                    slug,
                ),
            ),
        )
        .limit(1);

    return rows[0];
}

async function seed(): Promise<void> {
    /*
     * ---------------------------------------------------------
     * MAKE
     * ---------------------------------------------------------
     */

    let toyota = await findMake(
        "toyota",
    );

    if (!toyota) {
        const inserted =
            await db
                .insert(vehicleMakes)
                .values({
                    name: "Toyota",
                    slug: "toyota",
                    aliases: [
                        "toyota motors",
                    ],
                    nigeriaMarket: true,
                    active: true,
                })
                .returning();

        toyota = inserted[0];
    }

    if (!toyota) {
        throw new Error(
            "Unable to create Toyota.",
        );
    }

    /*
     * ---------------------------------------------------------
     * MODEL
     * ---------------------------------------------------------
     */

    let camry = await findModel(
        toyota.id,
        "camry",
    );

    if (!camry) {
        const inserted =
            await db
                .insert(vehicleModels)
                .values({
                    makeId: toyota.id,
                    name: "Camry",
                    slug: "camry",
                    aliases: [
                        "toyota camry",
                    ],
                    nigeriaMarket: true,
                    active: true,
                })
                .returning();

        camry = inserted[0];
    }

    if (!camry) {
        throw new Error(
            "Unable to create Camry.",
        );
    }

    /*
     * ---------------------------------------------------------
     * ENGINE
     * ---------------------------------------------------------
     */

    let dynamicForce =
        await findEngine(
            camry.id,
            "2-5l-dynamic-force",
        );

    if (!dynamicForce) {
        const inserted =
            await db
                .insert(vehicleEngines)
                .values({
                    modelId: camry.id,

                    name:
                        "2.5L Dynamic Force",

                    slug:
                        "2-5l-dynamic-force",

                    displacementCc:
                        2487,

                    cylinders: 4,

                    horsepower: 203,

                    aliases: [
                        "2.5",
                        "2.5l",
                        "dynamic force 2.5",
                    ],

                    nigeriaMarket: true,

                    active: true,
                })
                .returning();

        dynamicForce = inserted[0];
    }

    if (!dynamicForce) {
        throw new Error(
            "Unable to create 2.5L Dynamic Force engine.",
        );
    }

    /*
     * ---------------------------------------------------------
     * GENERATION
     * ---------------------------------------------------------
     */

    let generation =
        await findGeneration(
            camry.id,
            "xv70",
        );

    if (!generation) {
        const inserted =
            await db
                .insert(vehicleGenerations)
                .values({
                    modelId: camry.id,

                    name: "XV70",

                    slug: "xv70",

                    startYear: 2018,

                    endYear: 2024,

                    aliases: [
                        "8th generation camry",
                        "eighth generation camry",
                    ],

                    nigeriaMarket: true,

                    active: true,
                })
                .returning();

        generation = inserted[0];
    }

    if (!generation) {
        throw new Error(
            "Unable to create generation.",
        );
    }

    /*
     * ---------------------------------------------------------
     * VARIANTS
     * ---------------------------------------------------------
     */

    const variants = [
        {
            generationId:
                generation.id,

            engineId:
                dynamicForce.id,

            year: 2022,

            name: "LE 2.5L",

            slug: "le-2-5l",

            engineName:
                dynamicForce.name,

            engineDisplacementCc:
                dynamicForce.displacementCc,

            cylinders:
                dynamicForce.cylinders,

            horsepower: 203,

            bodyStyle:
                "SEDAN" as const,

            fuelType:
                "PETROL" as const,

            transmission:
                "AUTOMATIC" as const,

            driveType:
                "FWD" as const,

            seats: 5,

            doors: 4,

            aliases: [
                "camry le",
                "le",
            ],

            nigeriaMarket: true,

            active: true,
        },

        {
            generationId:
                generation.id,

            engineId:
                dynamicForce.id,

            year: 2022,

            name: "SE 2.5L",

            slug: "se-2-5l",

            engineName:
                dynamicForce.name,

            engineDisplacementCc:
                dynamicForce.displacementCc,

            cylinders:
                dynamicForce.cylinders,

            horsepower: 203,

            bodyStyle:
                "SEDAN" as const,

            fuelType:
                "PETROL" as const,

            transmission:
                "AUTOMATIC" as const,

            driveType:
                "FWD" as const,

            seats: 5,

            doors: 4,

            aliases: [
                "camry se",
                "se",
            ],

            nigeriaMarket: true,

            active: true,
        },

        {
            generationId:
                generation.id,

            engineId:
                dynamicForce.id,

            year: 2022,

            name: "XSE 2.5L",

            slug: "xse-2-5l",

            engineName:
                dynamicForce.name,

            engineDisplacementCc:
                dynamicForce.displacementCc,

            cylinders:
                dynamicForce.cylinders,

            horsepower: 206,

            bodyStyle:
                "SEDAN" as const,

            fuelType:
                "PETROL" as const,

            transmission:
                "AUTOMATIC" as const,

            driveType:
                "FWD" as const,

            seats: 5,

            doors: 4,

            aliases: [
                "camry xse",
                "xse",
            ],

            nigeriaMarket: true,

            active: true,
        },
    ];

    /*
     * ---------------------------------------------------------
     * INSERT / UPDATE VARIANTS
     * ---------------------------------------------------------
     */

    for (const variant of variants) {
        await db
            .insert(vehicleVariants)
            .values(variant)
            .onConflictDoUpdate({
                target: [
                    vehicleVariants.generationId,
                    vehicleVariants.year,
                    vehicleVariants.slug,
                ],

                set: {
                    name:
                        variant.name,

                    engineId:
                        variant.engineId,

                    engineName:
                        variant.engineName,

                    engineDisplacementCc:
                        variant.engineDisplacementCc,

                    cylinders:
                        variant.cylinders,

                    horsepower:
                        variant.horsepower,

                    bodyStyle:
                        variant.bodyStyle,

                    fuelType:
                        variant.fuelType,

                    transmission:
                        variant.transmission,

                    driveType:
                        variant.driveType,

                    seats:
                        variant.seats,

                    doors:
                        variant.doors,

                    aliases:
                        variant.aliases,

                    nigeriaMarket:
                        variant.nigeriaMarket,

                    active:
                        variant.active,

                    updatedAt:
                        new Date(),
                },
            });
    }

    console.log(
        "Development vehicle fixture seeded successfully.",
    );
}

try {
    await seed();
} catch (error) {
    console.error(
        "Vehicle seed failed:",
        error,
    );

    process.exitCode = 1;
} finally {
    await closeDatabase();
}