import {
    and,
    asc,
    eq,
    ilike,
    or,
} from "drizzle-orm";

import { db } from "../../database/index.ts";

import {
    vehicleEngines,
    vehicleGenerations,
    vehicleMakes,
    vehicleModels,
    vehicleVariants,
} from "../../database/schema/index.ts";

export interface VehicleSearchOptions {
    nigeriaMarket?: boolean;
    limit?: number;
}

/**
 * List active vehicle makes.
 *
 * By default, only makes available to the Nigerian
 * market are returned.
 */
export async function listMakes(
    nigeriaMarket = true,
) {
    const conditions = [
        eq(
            vehicleMakes.active,
            true,
        ),
    ];

    if (nigeriaMarket) {
        conditions.push(
            eq(
                vehicleMakes.nigeriaMarket,
                true,
            ),
        );
    }

    return db
        .select()
        .from(vehicleMakes)
        .where(and(...conditions))
        .orderBy(
            asc(vehicleMakes.name),
        );
}

/**
 * List active models belonging to a make.
 */
export async function listModels(
    makeId: string,
    nigeriaMarket = true,
) {
    const conditions = [
        eq(
            vehicleModels.makeId,
            makeId,
        ),
        eq(
            vehicleModels.active,
            true,
        ),
    ];

    if (nigeriaMarket) {
        conditions.push(
            eq(
                vehicleModels.nigeriaMarket,
                true,
            ),
        );
    }

    return db
        .select()
        .from(vehicleModels)
        .where(and(...conditions))
        .orderBy(
            asc(vehicleModels.name),
        );
}

/**
 * List active generations belonging to a model.
 */
export async function listGenerations(
    modelId: string,
    nigeriaMarket = true,
) {
    const conditions = [
        eq(
            vehicleGenerations.modelId,
            modelId,
        ),
        eq(
            vehicleGenerations.active,
            true,
        ),
    ];

    if (nigeriaMarket) {
        conditions.push(
            eq(
                vehicleGenerations.nigeriaMarket,
                true,
            ),
        );
    }

    return db
        .select()
        .from(vehicleGenerations)
        .where(and(...conditions))
        .orderBy(
            asc(
                vehicleGenerations.startYear,
            ),
            asc(
                vehicleGenerations.name,
            ),
        );
}

/**
 * List active variants belonging to a generation.
 *
 * Optionally filters by model year.
 *
 * Engine information comes from the canonical
 * vehicle_engines table when an engine is linked.
 */
export async function listVariants(
    generationId: string,
    year?: number,
    nigeriaMarket = true,
) {
    const conditions = [
        eq(
            vehicleVariants.generationId,
            generationId,
        ),
        eq(
            vehicleVariants.active,
            true,
        ),
    ];

    if (year !== undefined) {
        conditions.push(
            eq(
                vehicleVariants.year,
                year,
            ),
        );
    }

    if (nigeriaMarket) {
        conditions.push(
            eq(
                vehicleVariants.nigeriaMarket,
                true,
            ),
        );
    }

    return db
        .select({
            id: vehicleVariants.id,
            generationId:
                vehicleVariants.generationId,
            year:
                vehicleVariants.year,
            name:
                vehicleVariants.name,
            slug:
                vehicleVariants.slug,

            engineId:
                vehicleVariants.engineId,

            engine: {
                id:
                    vehicleEngines.id,
                name:
                    vehicleEngines.name,
                slug:
                    vehicleEngines.slug,
                displacementCc:
                    vehicleEngines.displacementCc,
                cylinders:
                    vehicleEngines.cylinders,
                horsepower:
                    vehicleEngines.horsepower,
                aliases:
                    vehicleEngines.aliases,
            },

            /*
             * Legacy engine fields retained temporarily
             * for backwards compatibility.
             */
            engineName:
                vehicleVariants.engineName,
            engineDisplacementCc:
                vehicleVariants.engineDisplacementCc,
            variantCylinders:
                vehicleVariants.cylinders,
            variantHorsepower:
                vehicleVariants.horsepower,

            fuelType:
                vehicleVariants.fuelType,
            transmission:
                vehicleVariants.transmission,
            driveType:
                vehicleVariants.driveType,
            bodyStyle:
                vehicleVariants.bodyStyle,
            seats:
                vehicleVariants.seats,
            doors:
                vehicleVariants.doors,

            aliases:
                vehicleVariants.aliases,
            nigeriaMarket:
                vehicleVariants.nigeriaMarket,
            active:
                vehicleVariants.active,
        })
        .from(vehicleVariants)
        .leftJoin(
            vehicleEngines,
            eq(
                vehicleVariants.engineId,
                vehicleEngines.id,
            ),
        )
        .where(and(...conditions))
        .orderBy(
            asc(vehicleVariants.year),
            asc(vehicleVariants.name),
        );
}

/**
 * Search the complete vehicle hierarchy:
 *
 * Make
 * Model
 * Generation
 * Engine
 * Variant
 *
 * Searches canonical names.
 *
 * Alias searching will be added with a PostgreSQL
 * JSONB-aware implementation when we introduce the
 * catalog search index.
 */
export async function searchVehicles(
    search: string,
    options: VehicleSearchOptions = {},
) {
    const normalizedSearch =
        search.trim();

    if (!normalizedSearch) {
        return [];
    }

    const pattern =
        `%${normalizedSearch}%`;

    const requestedLimit =
        options.limit ?? 50;

    const limit = Math.min(
        Math.max(
            Math.trunc(requestedLimit),
            1,
        ),
        100,
    );

    const conditions = [
        eq(
            vehicleMakes.active,
            true,
        ),
        eq(
            vehicleModels.active,
            true,
        ),
        eq(
            vehicleGenerations.active,
            true,
        ),
        eq(
            vehicleVariants.active,
            true,
        ),
    ];

    if (
        options.nigeriaMarket !== false
    ) {
        conditions.push(
            eq(
                vehicleMakes.nigeriaMarket,
                true,
            ),
            eq(
                vehicleModels.nigeriaMarket,
                true,
            ),
            eq(
                vehicleGenerations.nigeriaMarket,
                true,
            ),
            eq(
                vehicleVariants.nigeriaMarket,
                true,
            ),
        );
    }

    const searchCondition = or(
        ilike(
            vehicleMakes.name,
            pattern,
        ),
        ilike(
            vehicleModels.name,
            pattern,
        ),
        ilike(
            vehicleGenerations.name,
            pattern,
        ),
        ilike(
            vehicleVariants.name,
            pattern,
        ),
        ilike(
            vehicleEngines.name,
            pattern,
        ),
    );

    if (searchCondition) {
        conditions.push(
            searchCondition,
        );
    }

    return db
        .select({
            variantId:
                vehicleVariants.id,

            variantName:
                vehicleVariants.name,

            variantSlug:
                vehicleVariants.slug,

            variantAliases:
                vehicleVariants.aliases,

            year:
                vehicleVariants.year,

            engineId:
                vehicleVariants.engineId,

            engineName:
                vehicleEngines.name,

            engineSlug:
                vehicleEngines.slug,

            engineAliases:
                vehicleEngines.aliases,

            engineDisplacementCc:
                vehicleEngines.displacementCc,

            engineCylinders:
                vehicleEngines.cylinders,

            engineHorsepower:
                vehicleEngines.horsepower,

            /*
             * Legacy fallback fields.
             */
            legacyEngineName:
                vehicleVariants.engineName,

            legacyEngineDisplacementCc:
                vehicleVariants.engineDisplacementCc,

            legacyCylinders:
                vehicleVariants.cylinders,

            legacyHorsepower:
                vehicleVariants.horsepower,

            bodyStyle:
                vehicleVariants.bodyStyle,

            fuelType:
                vehicleVariants.fuelType,

            transmission:
                vehicleVariants.transmission,

            driveType:
                vehicleVariants.driveType,

            seats:
                vehicleVariants.seats,

            doors:
                vehicleVariants.doors,

            generationId:
                vehicleGenerations.id,

            generationName:
                vehicleGenerations.name,

            generationSlug:
                vehicleGenerations.slug,

            generationAliases:
                vehicleGenerations.aliases,

            modelId:
                vehicleModels.id,

            modelName:
                vehicleModels.name,

            modelSlug:
                vehicleModels.slug,

            modelAliases:
                vehicleModels.aliases,

            makeId:
                vehicleMakes.id,

            makeName:
                vehicleMakes.name,

            makeSlug:
                vehicleMakes.slug,

            makeAliases:
                vehicleMakes.aliases,
        })
        .from(vehicleVariants)
        .innerJoin(
            vehicleGenerations,
            eq(
                vehicleVariants.generationId,
                vehicleGenerations.id,
            ),
        )
        .innerJoin(
            vehicleModels,
            eq(
                vehicleGenerations.modelId,
                vehicleModels.id,
            ),
        )
        .innerJoin(
            vehicleMakes,
            eq(
                vehicleModels.makeId,
                vehicleMakes.id,
            ),
        )
        .leftJoin(
            vehicleEngines,
            eq(
                vehicleVariants.engineId,
                vehicleEngines.id,
            ),
        )
        .where(and(...conditions))
        .orderBy(
            asc(vehicleMakes.name),
            asc(vehicleModels.name),
            asc(
                vehicleGenerations.startYear,
            ),
            asc(
                vehicleGenerations.name,
            ),
            asc(vehicleVariants.year),
            asc(vehicleVariants.name),
        )
        .limit(limit);
}