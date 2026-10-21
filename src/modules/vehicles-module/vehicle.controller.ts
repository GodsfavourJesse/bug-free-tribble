import type {
    Request,
    Response,
} from "express";

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