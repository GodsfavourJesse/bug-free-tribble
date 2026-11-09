import { eq, sql } from "drizzle-orm";

import { db } from "../../src/database/index.ts";

import {
    vehicleMakes,
    vehicleModels,
    vehicleGenerations,
    vehicleEngines,
    vehicleVariants,
    vehicleModelYears,
    vehicleDataSourceLinks,
} from "../../src/database/schema/index.ts";

export async function generateVehicleCatalogReport() {
    const [
        makes,
        models,
        generations,
        engines,
        variants,
        modelYears,
        verifiedSources,
    ] = await Promise.all([
        db.select({
            total: sql<number>`count(*)::int`,
        }).from(vehicleMakes),

        db.select({
            total: sql<number>`count(*)::int`,
        }).from(vehicleModels),

        db.select({
            total: sql<number>`count(*)::int`,
        }).from(vehicleGenerations),

        db.select({
            total: sql<number>`count(*)::int`,
        }).from(vehicleEngines),

        db.select({
            total: sql<number>`count(*)::int`,
        }).from(vehicleVariants),

        db.select({
            total: sql<number>`count(*)::int`,
        }).from(vehicleModelYears),

        db.select({
            total: sql<number>`count(*)::int`,
        })
            .from(vehicleDataSourceLinks)
            .where(
                eq(
                    vehicleDataSourceLinks.verificationStatus,
                    "VERIFIED",
                ),
            ),
    ]);

    const [
        modelsWithGenerations,
        modelsWithoutGenerations,
    ] = await Promise.all([
        db.select({
            total: sql<number>`count(distinct ${vehicleGenerations.modelId})::int`,
        }).from(vehicleGenerations),

        db.select({
            total: sql<number>`count(*)::int`,
        })
            .from(vehicleModels)
            .where(
                sql`
                    NOT EXISTS (
                        SELECT 1
                        FROM vehicle_generations vg
                        WHERE vg.model_id = ${vehicleModels.id}
                    )
                `,
            ),
    ]);

    const [modelsWithEngines] = await db
        .select({
            total: sql<number>`count(distinct ${vehicleEngines.modelId})::int`,
        })
        .from(vehicleEngines);

    const [modelsWithVariants] = await db
        .select({
            total: sql<number>`count(distinct ${vehicleVariants.modelId})::int`,
        })
        .from(vehicleVariants);

    const result = {
        manufacturers: makes[0]?.total ?? 0,
        models: models[0]?.total ?? 0,
        generations: generations[0]?.total ?? 0,
        engines: engines[0]?.total ?? 0,
        variants: variants[0]?.total ?? 0,
        modelYears: modelYears[0]?.total ?? 0,

        modelsWithGenerations:
            modelsWithGenerations[0]?.total ?? 0,

        modelsWithoutGenerations:
            modelsWithoutGenerations[0]?.total ?? 0,

        modelsWithEngines:
            modelsWithEngines?.total ?? 0,

        modelsWithVariants:
            modelsWithVariants?.total ?? 0,

        verifiedSourceLinks:
            verifiedSources[0]?.total ?? 0,
    };

    console.log("\nKARMASS VEHICLE CATALOG REPORT\n");

    console.table(result);

    return result;
}