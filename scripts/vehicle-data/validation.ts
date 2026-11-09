import { z } from "zod";

const sourceSchema = z.object({
    name: z.string().min(2),
    url: z.string().url(),

    sourceType: z.enum([
        "MANUFACTURER",
        "GOVERNMENT",
        "TECHNICAL_DOCUMENT",
        "AUTOMOTIVE_PUBLICATION",
        "OTHER",
    ]),

    licenseName: z.string().optional(),
    licenseUrl: z.string().url().optional(),

    attributionRequired: z.boolean().optional(),
    attributionText: z.string().optional(),

    reuseNotes: z.string().optional(),

    accessedAt: z.string().optional(),

    verificationStatus: z.enum([
        "PENDING",
        "VERIFIED",
        "DISPUTED",
        "REJECTED",
    ]),

    verificationNotes: z.string().optional(),
});

const positiveNumber = z.number()
    .positive()
    .optional();

const nonNegativeNumber = z.number()
    .nonnegative()
    .optional();

const engineSchema = z.object({
    name: z.string().min(1),
    slug: z.string().min(1),

    engineCode: z.string().optional(),

    displacementCc: positiveNumber,
    cylinders: positiveNumber,
    horsepower: positiveNumber,

    configuration: z.string().optional(),
    cylinderLayout: z.string().optional(),

    valves: positiveNumber,
    valvesPerCylinder: positiveNumber,

    valveTrain: z.string().optional(),
    aspiration: z.string().optional(),
    fuelSystem: z.string().optional(),

    powerKw: positiveNumber,
    powerRpm: positiveNumber,

    torqueNm: positiveNumber,
    torqueRpm: positiveNumber,

    compressionRatio: positiveNumber,

    boreMm: positiveNumber,
    strokeMm: positiveNumber,

    hybridSystem: z.string().optional(),

    motorPowerKw: positiveNumber,
    batteryCapacityKwh: positiveNumber,
    electricRangeKm: nonNegativeNumber,

    aliases: z.array(z.string()).optional(),

    additionalSpecifications: z
        .record(z.string(), z.unknown())
        .optional(),

    sources: z.array(sourceSchema),
});

const variantSchema = z.object({
    name: z.string().min(1),
    slug: z.string().min(1),

    trimCode: z.string().optional(),

    year: z.number()
        .int()
        .min(1886)
        .max(2100),

    engineSlug: z.string().optional(),

    fuelType: z.enum([
        "PETROL",
        "DIESEL",
        "HYBRID",
        "PLUG_IN_HYBRID",
        "ELECTRIC",
        "CNG",
        "LPG",
    ]).optional(),

    transmission: z.enum([
        "MANUAL",
        "AUTOMATIC",
        "CVT",
        "DCT",
        "AMT",
    ]).optional(),

    driveType: z.enum([
        "FWD",
        "RWD",
        "AWD",
        "FOUR_WD",
    ]).optional(),

    bodyStyle: z.enum([
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
    ]).optional(),

    horsepower: positiveNumber,

    seats: positiveNumber,
    doors: positiveNumber,

    topSpeedKph: positiveNumber,
    acceleration0To100Seconds: positiveNumber,

    fuelConsumptionCityL100Km: positiveNumber,
    fuelConsumptionHighwayL100Km: positiveNumber,
    fuelConsumptionCombinedL100Km: positiveNumber,

    batteryCapacityKwh: positiveNumber,
    electricRangeKm: nonNegativeNumber,
    chargingPowerKw: positiveNumber,

    curbWeightKg: positiveNumber,
    grossWeightKg: positiveNumber,
    towingCapacityKg: positiveNumber,

    lengthMm: positiveNumber,
    widthMm: positiveNumber,
    heightMm: positiveNumber,
    wheelbaseMm: positiveNumber,
    groundClearanceMm: positiveNumber,

    fuelTankCapacityLitres: positiveNumber,
    cargoCapacityLitres: positiveNumber,

    tyreSizes: z.array(z.string()).optional(),

    equipment: z.array(z.string()).optional(),

    additionalSpecifications: z
        .record(z.string(), z.unknown())
        .optional(),

    markets: z.array(
        z.string().length(2),
    ).min(1),

    sources: z.array(sourceSchema),
});

const modelYearSchema = z.object({
    year: z.number()
        .int()
        .min(1886)
        .max(2100),

    markets: z.array(
        z.string().length(2),
    ).min(1),
});

const generationSchema = z.object({
    name: z.string().min(1),
    slug: z.string().min(1),

    chassisCode: z.string().optional(),
    platformCode: z.string().optional(),

    startYear: z.number()
        .int()
        .min(1886)
        .max(2100)
        .optional(),

    endYear: z.number()
        .int()
        .min(1886)
        .max(2100)
        .optional(),

    aliases: z.array(z.string()).optional(),

    bodyStyles: z.array(
        z.enum([
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
        ]),
    ).optional(),

    markets: z.array(
        z.string().length(2),
    ).min(1),

    engines: z.array(engineSchema),

    modelYears: z.array(modelYearSchema),

    variants: z.array(variantSchema),

    sources: z.array(sourceSchema),
}).superRefine((generation, ctx) => {
    if (
        generation.startYear !== undefined &&
        generation.endYear !== undefined &&
        generation.startYear > generation.endYear
    ) {
        ctx.addIssue({
            code: "custom",
            path: ["endYear"],
            message: "Generation end year cannot precede start year.",
        });
    }

    const engineSlugs = new Set(
        generation.engines.map((engine) => engine.slug),
    );

    for (const [index, variant] of generation.variants.entries()) {
        if (
            variant.engineSlug &&
            !engineSlugs.has(variant.engineSlug)
        ) {
            ctx.addIssue({
                code: "custom",
                path: ["variants", index, "engineSlug"],
                message: `Unknown engine slug: ${variant.engineSlug}`,
            });
        }

        if (
            generation.startYear !== undefined &&
            variant.year < generation.startYear
        ) {
            ctx.addIssue({
                code: "custom",
                path: ["variants", index, "year"],
                message: "Variant year precedes generation start year.",
            });
        }

        if (
            generation.endYear !== undefined &&
            variant.year > generation.endYear
        ) {
            ctx.addIssue({
                code: "custom",
                path: ["variants", index, "year"],
                message: "Variant year exceeds generation end year.",
            });
        }
    }
});

const modelSchema = z.object({
    name: z.string().min(1),
    slug: z.string().min(1),

    aliases: z.array(z.string()).optional(),

    generations: z.array(generationSchema).min(1),

    sources: z.array(sourceSchema),
});

export const vehicleCatalogSeedSchema = z.object({
    schemaVersion: z.literal(1),

    manufacturer: z.object({
        name: z.string().min(1),
        slug: z.string().min(1),

        countryOfOrigin: z.string()
            .length(2)
            .optional(),

        aliases: z.array(z.string()).optional(),

        models: z.array(modelSchema).min(1),

        sources: z.array(sourceSchema),
    }),
});

export type ValidatedVehicleCatalogSeed = z.infer<
    typeof vehicleCatalogSeedSchema
>;

export function validateVehicleCatalogSeed(
    input: unknown,
): ValidatedVehicleCatalogSeed {
    return vehicleCatalogSeedSchema.parse(input);
}