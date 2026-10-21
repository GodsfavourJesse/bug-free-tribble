import {
    and,
    asc,
    eq,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    vehicleGenerations,
    vehicleModelYears,
} from "../../../database/schema/index.ts";

/**
 * Options for retrieving vehicle model years.
 */
export interface VehicleModelYearOptions {
    /**
     * When true, return only Nigerian-market records.
     * When false, return all active records.
     *
     * Defaults to true.
     */
    nigeriaMarket?: boolean;
}

/**
 * List active model years for a generation.
 *
 * Results are returned in ascending year order.
 *
 * By default, only Nigerian-market records are returned.
 */
export async function listModelYears(
    generationId: string,
    options: VehicleModelYearOptions = {},
) {
    const conditions = [
        eq(
            vehicleModelYears.generationId,
            generationId,
        ),
        eq(
            vehicleModelYears.active,
            true,
        ),
    ];

    if (
        options.nigeriaMarket !== false
    ) {
        conditions.push(
            eq(
                vehicleModelYears.nigeriaMarket,
                true,
            ),
        );
    }

    return db
        .select({
            id: vehicleModelYears.id,
            generationId:
                vehicleModelYears.generationId,
            year: vehicleModelYears.year,
            nigeriaMarket:
                vehicleModelYears.nigeriaMarket,
            active: vehicleModelYears.active,
        })
        .from(vehicleModelYears)
        .where(
            and(...conditions),
        )
        .orderBy(
            asc(vehicleModelYears.year),
        );
}

/**
 * Retrieve a specific active model year.
 *
 * The model year must belong to the requested generation.
 *
 * Returns undefined when no matching record exists.
 */
export async function getModelYear(
    generationId: string,
    year: number,
    options: VehicleModelYearOptions = {},
) {
    const conditions = [
        eq(
            vehicleModelYears.generationId,
            generationId,
        ),
        eq(
            vehicleModelYears.year,
            year,
        ),
        eq(
            vehicleModelYears.active,
            true,
        ),
    ];

    if (
        options.nigeriaMarket !== false
    ) {
        conditions.push(
            eq(
                vehicleModelYears.nigeriaMarket,
                true,
            ),
        );
    }

    const [modelYear] = await db
        .select({
            id: vehicleModelYears.id,
            generationId:
                vehicleModelYears.generationId,
            year: vehicleModelYears.year,
            nigeriaMarket:
                vehicleModelYears.nigeriaMarket,
            active: vehicleModelYears.active,
        })
        .from(vehicleModelYears)
        .where(
            and(...conditions),
        )
        .limit(1);

    return modelYear;
}

/**
 * Validate that a model-year ID belongs to a generation
 * and is currently available for catalog selection.
 *
 * Returns true when valid, otherwise false.
 */
export async function isValidModelYear(
    generationId: string,
    modelYearId: string,
    options: VehicleModelYearOptions = {},
): Promise<boolean> {
    const conditions = [
        eq(
            vehicleModelYears.id,
            modelYearId,
        ),
        eq(
            vehicleModelYears.generationId,
            generationId,
        ),
        eq(
            vehicleModelYears.active,
            true,
        ),
        eq(
            vehicleGenerations.active,
            true,
        ),
        eq(
            vehicleGenerations.id,
            generationId,
        ),
    ];

    if (
        options.nigeriaMarket !== false
    ) {
        conditions.push(
            eq(
                vehicleModelYears.nigeriaMarket,
                true,
            ),
            eq(
                vehicleGenerations.nigeriaMarket,
                true,
            ),
        );
    }

    const [result] = await db
        .select({
            id: vehicleModelYears.id,
        })
        .from(vehicleModelYears)
        .innerJoin(
            vehicleGenerations,
            eq(
                vehicleModelYears.generationId,
                vehicleGenerations.id,
            ),
        )
        .where(
            and(...conditions),
        )
        .limit(1);

    return result !== undefined;
}