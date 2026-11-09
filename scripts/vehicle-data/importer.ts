import { and, eq } from "drizzle-orm";

import { db } from "../../src/database/index.ts";

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

    vehicleEngineSpecifications,
    vehicleVariantSpecifications,
} from "../../src/database/schema/index.ts";

import {
    validateVehicleCatalogSeed,
} from "./validation.ts";

import {
    attachVehicleSources,
} from "./source-manager.ts";

import type {
    VehicleCatalogSeedFile,
    VehicleResearchSource,
} from "./types.ts";

const MARKET_DETAILS: Record<
    string,
    { name: string; currencyCode: string }
> = {
    NG: { name: "Nigeria", currencyCode: "NGN" },
    US: { name: "United States", currencyCode: "USD" },
    GB: { name: "United Kingdom", currencyCode: "GBP" },
    CA: { name: "Canada", currencyCode: "CAD" },
    DE: { name: "Germany", currencyCode: "EUR" },
    JP: { name: "Japan", currencyCode: "JPY" },
    AE: { name: "United Arab Emirates", currencyCode: "AED" },
    AU: { name: "Australia", currencyCode: "AUD" },
    FR: { name: "France", currencyCode: "EUR" },
    IT: { name: "Italy", currencyCode: "EUR" },
    KR: { name: "South Korea", currencyCode: "KRW" },
    IN: { name: "India", currencyCode: "INR" },
};

const counters = {
    manufacturers: 0,
    models: 0,
    generations: 0,
    engines: 0,
    engineSpecifications: 0,
    variants: 0,
    variantSpecifications: 0,
    modelYears: 0,
    associations: 0,
    sources: 0,
};

function slugify(value: string): string {
    return value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

async function getMarket(countryCode: string) {
    const details = MARKET_DETAILS[countryCode];

    if (!details) {
        throw new Error(
            `Unsupported market code: ${countryCode}. Add its details to MARKET_DETAILS.`,
        );
    }

    const [market] = await db
        .insert(vehicleMarkets)
        .values({
            countryCode,
            name: details.name,
            currencyCode: details.currencyCode,
            active: true,
        })
        .onConflictDoUpdate({
            target: vehicleMarkets.countryCode,
            set: {
                name: details.name,
                currencyCode: details.currencyCode,
                active: true,
                updatedAt: new Date(),
            },
        })
        .returning();

    if (!market) {
        throw new Error(
            `Unable to initialize market: ${countryCode}`,
        );
    }

    return market;
}

async function associateMakeMarket(
    makeId: string,
    marketId: string,
) {
    const inserted = await db
        .insert(vehicleMakeMarkets)
        .values({ makeId, marketId })
        .onConflictDoNothing({
            target: [
                vehicleMakeMarkets.makeId,
                vehicleMakeMarkets.marketId,
            ],
        })
        .returning({
            makeId: vehicleMakeMarkets.makeId,
        });

    counters.associations += inserted.length;
}

async function associateModelMarket(
    modelId: string,
    marketId: string,
) {
    await db.insert(vehicleModelMarkets)
        .values({ modelId, marketId })
        .onConflictDoNothing({
            target: [
                vehicleModelMarkets.modelId,
                vehicleModelMarkets.marketId,
            ],
        });

    counters.associations++;
}

async function associateGenerationMarket(
    generationId: string,
    marketId: string,
) {
    await db.insert(vehicleGenerationMarkets)
        .values({ generationId, marketId })
        .onConflictDoNothing({
            target: [
                vehicleGenerationMarkets.generationId,
                vehicleGenerationMarkets.marketId,
            ],
        });

    counters.associations++;
}

async function associateEngineMarket(
    engineId: string,
    marketId: string,
) {
    await db.insert(vehicleEngineMarkets)
        .values({ engineId, marketId })
        .onConflictDoNothing({
            target: [
                vehicleEngineMarkets.engineId,
                vehicleEngineMarkets.marketId,
            ],
        });

    counters.associations++;
}

async function associateModelYearMarket(
    modelYearId: string,
    marketId: string,
) {
    await db.insert(vehicleModelYearMarkets)
        .values({ modelYearId, marketId })
        .onConflictDoNothing({
            target: [
                vehicleModelYearMarkets.modelYearId,
                vehicleModelYearMarkets.marketId,
            ],
        });

    counters.associations++;
}

async function associateVariantMarket(
    variantId: string,
    marketId: string,
) {
    await db.insert(vehicleVariantMarkets)
        .values({ variantId, marketId })
        .onConflictDoNothing({
            target: [
                vehicleVariantMarkets.variantId,
                vehicleVariantMarkets.marketId,
            ],
        });

    counters.associations++;
}

async function seedGeneration(
    modelId: string,
    data: VehicleCatalogSeedFile["manufacturer"]["models"][number]["generations"][number],
) {
    const [generation] = await db
        .insert(vehicleGenerations)
        .values({
            modelId,
            name: data.name,
            slug: data.slug,
            startYear: data.startYear ?? null,
            endYear: data.endYear ?? null,
            aliases: data.aliases ?? [],
            nigeriaMarket: data.markets.includes("NG"),
            active: true,
        })
        .onConflictDoUpdate({
            target: [
                vehicleGenerations.modelId,
                vehicleGenerations.name,
            ],
            set: {
                slug: data.slug,
                startYear: data.startYear ?? null,
                endYear: data.endYear ?? null,
                aliases: data.aliases ?? [],
                nigeriaMarket: data.markets.includes("NG"),
                active: true,
                updatedAt: new Date(),
            },
        })
        .returning();

    if (!generation) {
        throw new Error(
            `Unable to import generation: ${data.name}`,
        );
    }

    counters.generations++;

    return generation;
}

async function seedEngine(
    modelId: string,
    data: VehicleCatalogSeedFile["manufacturer"]["models"][number]["generations"][number]["engines"][number],
) {
    const [engine] = await db
        .insert(vehicleEngines)
        .values({
            modelId,
            name: data.name,
            slug: data.slug,
            displacementCc: data.displacementCc ?? null,
            cylinders: data.cylinders ?? null,
            horsepower: data.horsepower ?? null,
            aliases: data.aliases ?? [],
            nigeriaMarket: true,
            active: true,
        })
        .onConflictDoUpdate({
            target: [
                vehicleEngines.modelId,
                vehicleEngines.slug,
            ],
            set: {
                name: data.name,
                displacementCc: data.displacementCc ?? null,
                cylinders: data.cylinders ?? null,
                horsepower: data.horsepower ?? null,
                aliases: data.aliases ?? [],
                active: true,
                updatedAt: new Date(),
            },
        })
        .returning();

    if (!engine) {
        throw new Error(
            `Unable to import engine: ${data.name}`,
        );
    }

    const [specifications] = await db
        .insert(vehicleEngineSpecifications)
        .values({
            engineId: engine.id,
            engineCode: data.engineCode ?? null,
            configuration: data.configuration ?? null,
            cylinderLayout: data.cylinderLayout ?? null,
            valves: data.valves ?? null,
            valvesPerCylinder: data.valvesPerCylinder ?? null,
            valveTrain: data.valveTrain ?? null,
            aspiration: data.aspiration ?? null,
            fuelSystem: data.fuelSystem ?? null,
            powerKw: data.powerKw ?? null,
            powerRpm: data.powerRpm ?? null,
            torqueNm: data.torqueNm ?? null,
            torqueRpm: data.torqueRpm ?? null,
            compressionRatio: data.compressionRatio ?? null,
            boreMm: data.boreMm ?? null,
            strokeMm: data.strokeMm ?? null,
            hybridSystem: data.hybridSystem ?? null,
            motorPowerKw: data.motorPowerKw ?? null,
            batteryCapacityKwh: data.batteryCapacityKwh ?? null,
            electricRangeKm: data.electricRangeKm ?? null,
            additionalSpecifications:
                data.additionalSpecifications ?? {},
        })
        .onConflictDoUpdate({
            target: vehicleEngineSpecifications.engineId,
            set: {
                engineCode: data.engineCode ?? null,
                configuration: data.configuration ?? null,
                cylinderLayout: data.cylinderLayout ?? null,
                valves: data.valves ?? null,
                valvesPerCylinder: data.valvesPerCylinder ?? null,
                valveTrain: data.valveTrain ?? null,
                aspiration: data.aspiration ?? null,
                fuelSystem: data.fuelSystem ?? null,
                powerKw: data.powerKw ?? null,
                powerRpm: data.powerRpm ?? null,
                torqueNm: data.torqueNm ?? null,
                torqueRpm: data.torqueRpm ?? null,
                compressionRatio: data.compressionRatio ?? null,
                boreMm: data.boreMm ?? null,
                strokeMm: data.strokeMm ?? null,
                hybridSystem: data.hybridSystem ?? null,
                motorPowerKw: data.motorPowerKw ?? null,
                batteryCapacityKwh: data.batteryCapacityKwh ?? null,
                electricRangeKm: data.electricRangeKm ?? null,
                additionalSpecifications:
                    data.additionalSpecifications ?? {},
                updatedAt: new Date(),
            },
        })
        .returning();

    counters.engines++;
    counters.engineSpecifications++;

    await attachVehicleSources(
        "ENGINE",
        engine.id,
        data.sources,
    );

    return engine;
}

async function seedModelYear(
    generationId: string,
    year: number,
    markets: string[],
) {
    const [modelYear] = await db
        .insert(vehicleModelYears)
        .values({
            generationId,
            year,
            nigeriaMarket: markets.includes("NG"),
            active: true,
        })
        .onConflictDoUpdate({
            target: [
                vehicleModelYears.generationId,
                vehicleModelYears.year,
            ],
            set: {
                nigeriaMarket: markets.includes("NG"),
                active: true,
                updatedAt: new Date(),
            },
        })
        .returning();

    if (!modelYear) {
        throw new Error(
            `Unable to import model year: ${year}`,
        );
    }

    counters.modelYears++;

    return modelYear;
}

async function seedVariant(
    modelId: string,
    generationId: string,
    year: number,
    engineId: string | null,
    data: VehicleCatalogSeedFile["manufacturer"]["models"][number]["generations"][number]["variants"][number],
) {
    const [variant] = await db
        .insert(vehicleVariants)
        .values({
            modelId,
            generationId,
            engineId,
            year,
            name: data.name,
            slug: data.slug,
            engineName: null,
            engineDisplacementCc: null,
            cylinders: null,
            horsepower: data.horsepower ?? null,
            fuelType: data.fuelType ?? null,
            transmission: data.transmission ?? null,
            driveType: data.driveType ?? null,
            bodyStyle: data.bodyStyle ?? null,
            seats: data.seats ?? null,
            doors: data.doors ?? null,
            aliases: [],
            nigeriaMarket: data.markets.includes("NG"),
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
                name: data.name,
                horsepower: data.horsepower ?? null,
                fuelType: data.fuelType ?? null,
                transmission: data.transmission ?? null,
                driveType: data.driveType ?? null,
                bodyStyle: data.bodyStyle ?? null,
                seats: data.seats ?? null,
                doors: data.doors ?? null,
                nigeriaMarket: data.markets.includes("NG"),
                active: true,
                updatedAt: new Date(),
            },
        })
        .returning();

    if (!variant) {
        throw new Error(
            `Unable to import variant: ${data.name} (${year})`,
        );
    }

    const [specifications] = await db
        .insert(vehicleVariantSpecifications)
        .values({
            variantId: variant.id,
            topSpeedKph: data.topSpeedKph ?? null,
            acceleration0To100Seconds:
                data.acceleration0To100Seconds ?? null,
            fuelConsumptionCityL100Km:
                data.fuelConsumptionCityL100Km ?? null,
            fuelConsumptionHighwayL100Km:
                data.fuelConsumptionHighwayL100Km ?? null,
            fuelConsumptionCombinedL100Km:
                data.fuelConsumptionCombinedL100Km ?? null,
            batteryCapacityKwh: data.batteryCapacityKwh ?? null,
            electricRangeKm: data.electricRangeKm ?? null,
            chargingPowerKw: data.chargingPowerKw ?? null,
            curbWeightKg: data.curbWeightKg ?? null,
            grossWeightKg: data.grossWeightKg ?? null,
            towingCapacityKg: data.towingCapacityKg ?? null,
            lengthMm: data.lengthMm ?? null,
            widthMm: data.widthMm ?? null,
            heightMm: data.heightMm ?? null,
            wheelbaseMm: data.wheelbaseMm ?? null,
            groundClearanceMm: data.groundClearanceMm ?? null,
            fuelTankCapacityLitres:
                data.fuelTankCapacityLitres ?? null,
            cargoCapacityLitres:
                data.cargoCapacityLitres ?? null,
            tyreSizes: data.tyreSizes ?? [],
            equipment: data.equipment ?? [],
            additionalSpecifications:
                data.additionalSpecifications ?? {},
        })
        .onConflictDoUpdate({
            target: vehicleVariantSpecifications.variantId,
            set: {
                topSpeedKph: data.topSpeedKph ?? null,
                acceleration0To100Seconds:
                    data.acceleration0To100Seconds ?? null,
                fuelConsumptionCityL100Km:
                    data.fuelConsumptionCityL100Km ?? null,
                fuelConsumptionHighwayL100Km:
                    data.fuelConsumptionHighwayL100Km ?? null,
                fuelConsumptionCombinedL100Km:
                    data.fuelConsumptionCombinedL100Km ?? null,
                batteryCapacityKwh: data.batteryCapacityKwh ?? null,
                electricRangeKm: data.electricRangeKm ?? null,
                chargingPowerKw: data.chargingPowerKw ?? null,
                curbWeightKg: data.curbWeightKg ?? null,
                grossWeightKg: data.grossWeightKg ?? null,
                towingCapacityKg: data.towingCapacityKg ?? null,
                lengthMm: data.lengthMm ?? null,
                widthMm: data.widthMm ?? null,
                heightMm: data.heightMm ?? null,
                wheelbaseMm: data.wheelbaseMm ?? null,
                groundClearanceMm: data.groundClearanceMm ?? null,
                fuelTankCapacityLitres:
                    data.fuelTankCapacityLitres ?? null,
                cargoCapacityLitres:
                    data.cargoCapacityLitres ?? null,
                tyreSizes: data.tyreSizes ?? [],
                equipment: data.equipment ?? [],
                additionalSpecifications:
                    data.additionalSpecifications ?? {},
                updatedAt: new Date(),
            },
        })
        .returning();

    counters.variants++;
    counters.variantSpecifications++;

    await attachVehicleSources(
        "VARIANT",
        variant.id,
        data.sources,
    );

    return variant;
}

export async function importVehicleCatalog(
    input: unknown,
): Promise<void> {
    const parsed = validateVehicleCatalogSeed(input);

    const manufacturer = parsed.manufacturer;

    const makeMarketCodes = new Set(
        manufacturer.models.flatMap((item) =>
            item.generations.flatMap((generation) =>
                generation.markets,
            ),
        ),
    );

    const [make] = await db
        .select()
        .from(vehicleMakes)
        .where(
            eq(vehicleMakes.slug, manufacturer.slug),
        )
        .limit(1);

    if (!make) {
        throw new Error(
            `Manufacturer not found in vehicle_makes: ${manufacturer.name}. Run db:seed-vehicles first.`,
        );
    }

    counters.manufacturers++;

    await attachVehicleSources(
        "MAKE",
        make.id,
        manufacturer.sources,
    );

    for (const code of makeMarketCodes) {
        const market = await getMarket(code);

        await associateMakeMarket(make.id, market.id);
    }

    const marketIds = new Map<string, string>();

    const getMarketId = async (code: string) => {
        const existing = marketIds.get(code);

        if (existing) return existing;

        const market = await getMarket(code);
        marketIds.set(code, market.id);

        return market.id;
    };    

    for (const modelData of manufacturer.models) {
        const [model] = await db
            .select()
            .from(vehicleModels)
            .where(
                and(
                    eq(vehicleModels.makeId, make.id),
                    eq(vehicleModels.slug, modelData.slug),
                ),
            )
            .limit(1);

        if (!model) {
            throw new Error(
                `Model not found: ${manufacturer.name} ${modelData.name}. Run db:seed-vehicles first or correct the slug.`,
            );
        }

        counters.models++;

        await attachVehicleSources(
            "MODEL",
            model.id,
            modelData.sources,
        );

        for (const generationData of modelData.generations) {
            const generation = await seedGeneration(
                model.id,
                generationData,
            );

            await attachVehicleSources(
                "GENERATION",
                generation.id,
                generationData.sources,
            );

            for (const code of generationData.markets) {
                const marketId = await getMarketId(code);

                await associateModelMarket(model.id, marketId);
                await associateGenerationMarket(
                    generation.id,
                    marketId,
                );
            }

            const engineIds = new Map<string, string>();

            for (const engineData of generationData.engines) {
                const engine = await seedEngine(
                    model.id,
                    engineData,
                );

                engineIds.set(engineData.slug, engine.id);

                for (const code of generationData.markets) {
                    const marketId = await getMarketId(code);

                    await associateEngineMarket(
                        engine.id,
                        marketId,
                    );
                }
            }

            const years = new Set<number>([
                ...generationData.modelYears.map(
                    (item) => item.year,
                ),
                ...generationData.variants.map(
                    (item) => item.year,
                ),
            ]);

            for (const year of [...years].sort()) {
                const configuredYearMarkets = generationData.modelYears.find(
                    (item) => item.year === year,
                )?.markets;

                const yearMarkets = new Set(
                    configuredYearMarkets?.length
                        ? configuredYearMarkets
                        : generationData.markets,
                );

                const modelYear = await seedModelYear(
                    generation.id,
                    year,
                    [...yearMarkets],
                );

                for (const code of yearMarkets) {
                    const marketId = await getMarketId(code);

                    await associateModelYearMarket(
                        modelYear.id,
                        marketId,
                    );
                }

                const yearVariants = generationData.variants
                    .filter((variant) => variant.year === year);

                for (const variantData of yearVariants) {
                    const engineId = variantData.engineSlug
                        ? engineIds.get(variantData.engineSlug)
                        : null;

                    if (
                        variantData.engineSlug &&
                        !engineId
                    ) {
                        throw new Error(
                            `Engine not found for variant ${variantData.name}: ${variantData.engineSlug}`,
                        );
                    }

                    const variant = await seedVariant(
                        model.id,
                        generation.id,
                        year,
                        engineId ?? null,
                        variantData,
                    );

                    await db
                        .insert(vehicleModelYearVariants)
                        .values({
                            modelYearId: modelYear.id,
                            variantId: variant.id,
                            generationId: generation.id,
                            year,
                        })
                        .onConflictDoNothing({
                            target: [
                                vehicleModelYearVariants.modelYearId,
                                vehicleModelYearVariants.variantId,
                            ],
                        });

                    for (const code of variantData.markets) {
                        const marketId = await getMarketId(code);

                        await associateVariantMarket(
                            variant.id,
                            marketId,
                        );
                    }
                }
            }
        }
    }
}

export function getVehicleImportCounters() {
    return { ...counters };
}