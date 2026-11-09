import type {
    Request,
    Response,
} from "express";

import {
    getExternalMakes as fetchExternalMakes,
    getExternalModels as fetchExternalModels,
    getExternalVehicleOptions as fetchExternalOptions,
    getVehicleProviderStatus,
} from "./providers/vehicle-data.providers.ts";

import {
    listGenerations,
    listMakes,
    listModels,
    listVariants,
    searchVehicles,
} from "./vehicle.service.ts";

function parseBooleanQuery(
    value: unknown,
    defaultValue: boolean,
): boolean {
    if (
        typeof value !== "string"
    ) {
        return defaultValue;
    }

    if (
        value === "true" ||
        value === "1"
    ) {
        return true;
    }

    if (
        value === "false" ||
        value === "0"
    ) {
        return false;
    }

    return defaultValue;
}

function parseYearQuery(
    value: unknown,
): number | undefined {
    if (
        typeof value !== "string"
    ) {
        return undefined;
    }

    const year = Number(value);

    if (
        !Number.isInteger(year) ||
        year < 1886 ||
        year > 2100
    ) {
        return undefined;
    }

    return year;
}

function parseLimitQuery(
    value: unknown,
): number | undefined {
    if (
        typeof value !== "string"
    ) {
        return undefined;
    }

    const limit = Number(value);

    if (
        !Number.isInteger(limit) ||
        limit < 1
    ) {
        return undefined;
    }

    return Math.min(limit, 100);
}

function getRouteParam(
    value: unknown,
): string | undefined {
    if (
        typeof value !== "string"
    ) {
        return undefined;
    }

    const normalized =
        value.trim();

    if (!normalized) {
        return undefined;
    }

    return normalized;
}

export async function getMakes(
    request: Request,
    response: Response,
): Promise<void> {
    const nigeriaMarket =
        parseBooleanQuery(
            request.query.market,
            true,
        );

    const makes =
        await listMakes(
            nigeriaMarket,
        );

    response.json({
        success: true,
        data: {
            makes,
        },
    });
}

export async function getModels(
    request: Request,
    response: Response,
): Promise<void> {
    const makeId =
        getRouteParam(
            request.params.makeId,
        );

    if (!makeId) {
        response.status(400).json({
            success: false,
            message:
                "A valid makeId is required.",
        });

        return;
    }

    const nigeriaMarket =
        parseBooleanQuery(
            request.query.market,
            true,
        );

    const models =
        await listModels(
            makeId,
            nigeriaMarket,
        );

    response.json({
        success: true,
        data: {
            models,
        },
    });
}

export async function getGenerations(
    request: Request,
    response: Response,
): Promise<void> {
    const modelId =
        getRouteParam(
            request.params.modelId,
        );

    if (!modelId) {
        response.status(400).json({
            success: false,
            message:
                "A valid modelId is required.",
        });

        return;
    }

    const nigeriaMarket =
        parseBooleanQuery(
            request.query.market,
            true,
        );

    const generations =
        await listGenerations(
            modelId,
            nigeriaMarket,
        );

    response.json({
        success: true,
        data: {
            generations,
        },
    });
}

export async function getVariants(
    request: Request,
    response: Response,
): Promise<void> {
    const generationId =
        getRouteParam(
            request.params.generationId,
        );

    if (!generationId) {
        response.status(400).json({
            success: false,
            message:
                "A valid generationId is required.",
        });

        return;
    }

    const year =
        parseYearQuery(
            request.query.year,
        );

    const nigeriaMarket =
        parseBooleanQuery(
            request.query.market,
            true,
        );

    const variants =
        await listVariants(
            generationId,
            year,
            nigeriaMarket,
        );

    response.json({
        success: true,
        data: {
            variants,
        },
    });
}

export async function search(
    request: Request,
    response: Response,
): Promise<void> {
    const query =
        typeof request.query.q ===
        "string"
            ? request.query.q.trim()
            : "";

    if (!query) {
        response.status(400).json({
            success: false,
            message:
                "Search query is required.",
        });

        return;
    }

    const nigeriaMarket =
        parseBooleanQuery(
            request.query.market,
            true,
        );

    const limit =
        parseLimitQuery(
            request.query.limit,
        );

    const searchOptions: {
        nigeriaMarket: boolean;
        limit?: number;
    } = {
        nigeriaMarket,
    };

    if (limit !== undefined) {
        searchOptions.limit = limit;
    }

    const vehicles =
        await searchVehicles(
            query,
            searchOptions,
        );

    response.json({
        success: true,
        data: {
            vehicles,
        },
    });
}
/** External API-backed vehicle catalogue. Provider credentials never leave the backend. */
export async function getExternalProviderStatus(
    _request: Request,
    response: Response,
): Promise<void> {
    response.json({ success: true, data: getVehicleProviderStatus() });
}

export async function getExternalMakes(
    request: Request,
    response: Response,
): Promise<void> {
    const provider = request.query.provider === "vehiclesdb" ? "vehiclesdb" : "carsxe";
    const makes = await fetchExternalMakes(provider);
    response.json({ success: true, data: { makes, provider } });
}

export async function getExternalModels(
    request: Request,
    response: Response,
): Promise<void> {
    const make = typeof request.query.make === "string" ? request.query.make.trim() : "";
    if (!make) {
        response.status(400).json({ success: false, message: "A vehicle make is required." });
        return;
    }
    const provider = request.query.provider === "vehiclesdb" ? "vehiclesdb" : "carsxe";
    const models = await fetchExternalModels(make, provider);
    response.json({ success: true, data: { models, provider } });
}

export async function getExternalVehicleOptions(
    request: Request,
    response: Response,
): Promise<void> {
    const allowed = ["years", "trims", "variants"] as const;
    const dimension = typeof request.query.dimension === "string" ? request.query.dimension : "";
    if (!allowed.includes(dimension as typeof allowed[number])) {
        response.status(400).json({ success: false, message: "dimension must be years, trims or variants." });
        return;
    }

    const make = typeof request.query.make === "string" ? request.query.make.trim() : undefined;
    const model = typeof request.query.model === "string" ? request.query.model.trim() : undefined;
    const rawYear = typeof request.query.year === "string" ? Number(request.query.year) : undefined;
    const year = rawYear !== undefined && Number.isInteger(rawYear) && rawYear >= 1886 && rawYear <= 2100 ? rawYear : undefined;

    if ((dimension === "trims" || dimension === "variants") && (!make || !model || !year)) {
        response.status(400).json({ success: false, message: "A make, model and valid year are required to retrieve vehicle variants." });
        return;
    }

    if (dimension === "years" && (!make || !model)) {
        response.status(400).json({ success: false, message: "A make and model are required to retrieve model years." });
        return;
    }

    const filters: { make?: string; model?: string; year?: number } = {};
    if (make) filters.make = make;
    if (model) filters.model = model;
    if (year !== undefined) filters.year = year;
    const options = await fetchExternalOptions(dimension as typeof allowed[number], filters);
    response.json({ success: true, data: { options, dimension, provider: "carsxe" } });
}
