import type {
    MarketplaceFilters,
    MarketplaceSort,
    MarketplaceFuelType,
    MarketplaceTransmission,
    MarketplaceBodyStyle,
    MarketplaceCondition,
} from "../marketplace.types.ts";

import {
    allowedFilterKeys,
    supportedBodyStyles,
    supportedFuelTypes,
    supportedSorts,
    supportedTransmissions,
} from "./saved-searches.types.ts";

import type {
    CreateSavedSearchInput,
    SavedSearchFilters,
    UpdateSavedSearchInput,
} from "./saved-searches.types.ts";

export const supportedConditions = [
    "BRAND_NEW",
    "FOREIGN_USED",
    "NIGERIAN_USED",
] as const satisfies readonly MarketplaceCondition[];


export class SavedSearchValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SavedSearchValidationError";
    }
}


function isRecord(
    value: unknown,
): value is Record<string, unknown> {
    return (
        typeof value === "object"
        && value !== null
        && !Array.isArray(value)
    );
}


function parseName(
    value: unknown,
): string {
    if (typeof value !== "string") {
        throw new SavedSearchValidationError(
            "Search name is required.",
        );
    }

    const name = value.trim();

    if (name.length === 0) {
        throw new SavedSearchValidationError(
            "Search name cannot be empty.",
        );
    }

    if (name.length > 120) {
        throw new SavedSearchValidationError(
            "Search name cannot exceed 120 characters.",
        );
    }

    return name;
}


function parseFilters(
    value: unknown,
): SavedSearchFilters {
    if (!isRecord(value)) {
        throw new SavedSearchValidationError(
            "Filters must be an object.",
        );
    }

    for (const key of Object.keys(value)) {
        if (!allowedFilterKeys.has(key)) {
            throw new SavedSearchValidationError(
                `Unsupported search filter: ${key}.`,
            );
        }
    }

    const filters: SavedSearchFilters = {};

    // --------------------------------------------------
    // STRING FILTERS
    // --------------------------------------------------

    const stringKeys = [
        "q",
        "make",
        "model",
        "variant",
        "makeId",
        "modelId",
        "variantId",
        "state",
        "city",
    ] as const;

    for (const key of stringKeys) {
        const item = value[key];

        if (item === undefined) {
            continue;
        }

        if (typeof item !== "string") {
            throw new SavedSearchValidationError(
                `${key} must be a string.`,
            );
        }

        const normalized = item.trim();

        if (!normalized) {
            continue;
        }

        if (normalized.length > 200) {
            throw new SavedSearchValidationError(
                `${key} cannot exceed 200 characters.`,
            );
        }

        if (key === "q") {
            filters.q = normalized;
        } else if (key === "make") {
            filters.make = normalized;
        } else if (key === "model") {
            filters.model = normalized;
        } else if (key === "variant") {
            filters.variant = normalized;
        } else if (key === "makeId") {
            filters.makeId = normalized;
        } else if (key === "modelId") {
            filters.modelId = normalized;
        } else if (key === "variantId") {
            filters.variantId = normalized;
        } else if (key === "state") {
            filters.state = normalized;
        } else if (key === "city") {
            filters.city = normalized;
        }
    }

    // --------------------------------------------------
    // NUMERIC FILTERS
    // --------------------------------------------------

    const numberKeys = [
        "minPrice",
        "maxPrice",
        "minMileage",
        "maxMileage",
        "minYear",
        "maxYear",
    ] as const;

    for (const key of numberKeys) {
        const item = value[key];

        if (item === undefined) {
            continue;
        }

        if (
            typeof item !== "number"
            || !Number.isFinite(item)
            || item < 0
        ) {
            throw new SavedSearchValidationError(
                `${key} must be a non-negative number.`,
            );
        }

        if (
            (key === "minYear" || key === "maxYear")
            && (
                !Number.isInteger(item)
                || item < 1886
                || item > 2100
            )
        ) {
            throw new SavedSearchValidationError(
                `${key} must be an integer between 1886 and 2100.`,
            );
        }

        switch (key) {
            case "minPrice":
                filters.minPrice = item;
                break;

            case "maxPrice":
                filters.maxPrice = item;
                break;

            case "minMileage":
                filters.minMileage = item;
                break;

            case "maxMileage":
                filters.maxMileage = item;
                break;

            case "minYear":
                filters.minYear = item;
                break;

            case "maxYear":
                filters.maxYear = item;
                break;
        }
    }

    // --------------------------------------------------
    // RANGE VALIDATION
    // --------------------------------------------------

    if (
        filters.minPrice !== undefined
        && filters.maxPrice !== undefined
        && filters.minPrice > filters.maxPrice
    ) {
        throw new SavedSearchValidationError(
            "Minimum price cannot exceed maximum price.",
        );
    }

    if (
        filters.minMileage !== undefined
        && filters.maxMileage !== undefined
        && filters.minMileage > filters.maxMileage
    ) {
        throw new SavedSearchValidationError(
            "Minimum mileage cannot exceed maximum mileage.",
        );
    }

    if (
        filters.minYear !== undefined
        && filters.maxYear !== undefined
        && filters.minYear > filters.maxYear
    ) {
        throw new SavedSearchValidationError(
            "Minimum year cannot exceed maximum year.",
        );
    }

    // --------------------------------------------------
    // ENUM FILTERS
    // --------------------------------------------------

    const fuelType = value.fuelType;

    if (fuelType !== undefined) {
        if (
            typeof fuelType !== "string"
            || !supportedFuelTypes.some(
                (item) => item === fuelType,
            )
        ) {
            throw new SavedSearchValidationError(
                "Unsupported fuelType value.",
            );
        }

        filters.fuelType = fuelType as MarketplaceFuelType;
    }

    const transmission = value.transmission;

    if (transmission !== undefined) {
        if (
            typeof transmission !== "string"
            || !supportedTransmissions.some(
                (item) => item === transmission,
            )
        ) {
            throw new SavedSearchValidationError(
                "Unsupported transmission value.",
            );
        }

        filters.transmission =
            transmission as MarketplaceTransmission;
    }

    const bodyStyle = value.bodyStyle;

    if (bodyStyle !== undefined) {
        if (
            typeof bodyStyle !== "string"
            || !supportedBodyStyles.some(
                (item) => item === bodyStyle,
            )
        ) {
            throw new SavedSearchValidationError(
                "Unsupported bodyStyle value.",
            );
        }

        filters.bodyStyle =
            bodyStyle as MarketplaceBodyStyle;
    }

    const sort = value.sort;

    if (sort !== undefined) {
        if (
            typeof sort !== "string"
            || !supportedSorts.some(
                (item) => item === sort,
            )
        ) {
            throw new SavedSearchValidationError(
                "Unsupported sort value.",
            );
        }

        filters.sort = sort as MarketplaceSort;
    }

    // --------------------------------------------------
    // VEHICLE CONDITION
    // --------------------------------------------------

    const condition = value.condition;

    if (condition !== undefined) {
        if (
            typeof condition !== "string"
            || !supportedConditions.some(
                (item) => item === condition,
            )
        ) {
            throw new SavedSearchValidationError(
                "condition must be BRAND_NEW, FOREIGN_USED, or NIGERIAN_USED.",
            );
        }

        filters.condition =
            condition as MarketplaceCondition;
    }

    // --------------------------------------------------
    // BOOLEAN FILTERS
    // --------------------------------------------------

    const dealerOnly = value.dealerOnly;

    if (dealerOnly !== undefined) {
        if (typeof dealerOnly !== "boolean") {
            throw new SavedSearchValidationError(
                "dealerOnly must be a boolean.",
            );
        }

        filters.dealerOnly = dealerOnly;
    }

    const verifiedDealerOnly = value.verifiedDealerOnly;

    if (verifiedDealerOnly !== undefined) {
        if (typeof verifiedDealerOnly !== "boolean") {
            throw new SavedSearchValidationError(
                "verifiedDealerOnly must be a boolean.",
            );
        }

        filters.verifiedDealerOnly =
            verifiedDealerOnly;
    }

    // --------------------------------------------------
    // DEALER FILTER CONSISTENCY
    // --------------------------------------------------

    if (
        filters.verifiedDealerOnly === true
        && filters.dealerOnly === false
    ) {
        throw new SavedSearchValidationError(
            "verifiedDealerOnly cannot be combined with dealerOnly=false.",
        );
    }

    return filters;
}


export function parseCreateSavedSearch(
    value: unknown,
): CreateSavedSearchInput {
    if (!isRecord(value)) {
        throw new SavedSearchValidationError(
            "Request body must be an object.",
        );
    }

    const allowedKeys = new Set([
        "name",
        "filters",
    ]);

    for (const key of Object.keys(value)) {
        if (!allowedKeys.has(key)) {
            throw new SavedSearchValidationError(
                `Unsupported request field: ${key}.`,
            );
        }
    }

    return {
        name: parseName(value.name),

        filters:
            value.filters === undefined
                ? {}
                : parseFilters(value.filters),
    };
}


export function parseUpdateSavedSearch(
    value: unknown,
): UpdateSavedSearchInput {
    if (!isRecord(value)) {
        throw new SavedSearchValidationError(
            "Request body must be an object.",
        );
    }

    const allowedKeys = new Set([
        "name",
        "filters",
    ]);

    for (const key of Object.keys(value)) {
        if (!allowedKeys.has(key)) {
            throw new SavedSearchValidationError(
                `Unsupported request field: ${key}.`,
            );
        }
    }

    if (
        value.name === undefined
        && value.filters === undefined
    ) {
        throw new SavedSearchValidationError(
            "Provide a name or filters to update.",
        );
    }

    const result: UpdateSavedSearchInput = {};

    if (value.name !== undefined) {
        result.name = parseName(value.name);
    }

    if (value.filters !== undefined) {
        result.filters = parseFilters(value.filters);
    }

    return result;
}


// Converts saved criteria into marketplace filters.
// Pagination is deliberately assigned by the caller.
export function toMarketplaceFilters(
    filters: SavedSearchFilters,
): Omit<MarketplaceFilters, "page" | "limit"> {
    return {
        ...filters,
    };
}