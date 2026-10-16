import type {
    MarketplaceFilters,
    MarketplaceSort,
    MarketplaceFuelType,
    MarketplaceTransmission,
    MarketplaceBodyStyle,
} from "../marketplace.types.ts";
import { allowedFilterKeys, CreateSavedSearchInput, SavedSearchFilters, supportedBodyStyles, supportedFuelTypes, supportedSorts, supportedTransmissions, UpdateSavedSearchInput } from "./saved-searches.types.ts";

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

    const stringKeys = [
        "q",
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

        if (normalized.length === 0) {
            continue;
        }

        if (normalized.length > 200) {
            throw new SavedSearchValidationError(
                `${key} cannot exceed 200 characters.`,
            );
        }

        filters[key] = normalized;
    }

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

        filters[key] = item;
    }

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

    const enumFilters = [
        {
            key: "fuelType",
            allowed: supportedFuelTypes,
        },
        {
            key: "transmission",
            allowed: supportedTransmissions,
        },
        {
            key: "bodyStyle",
            allowed: supportedBodyStyles,
        },
        {
            key: "sort",
            allowed: supportedSorts,
        },
    ] as const;

    for (const { key, allowed } of enumFilters) {
        const item = value[key];

        if (item === undefined) {
            continue;
        }

        if (
            typeof item !== "string"
            || !allowed.some((candidate) => candidate === item)
        ) {
            throw new SavedSearchValidationError(
                `Unsupported value for ${key}.`,
            );
        }

        if (key === "fuelType") {
            filters.fuelType = item as MarketplaceFuelType;
        } else if (key === "transmission") {
            filters.transmission =
                item as MarketplaceTransmission;
        } else if (key === "bodyStyle") {
            filters.bodyStyle = item as MarketplaceBodyStyle;
        } else {
            filters.sort = item as MarketplaceSort;
        }
    }

    if (value.condition !== undefined) {
        if (
            value.condition !== "NEW"
            && value.condition !== "USED"
        ) {
            throw new SavedSearchValidationError(
                "condition must be NEW or USED.",
            );
        }

        filters.condition = value.condition;
    }

    for (const key of [
        "dealerOnly",
        "verifiedDealerOnly",
    ] as const) {
        const item = value[key];

        if (item === undefined) {
            continue;
        }

        if (typeof item !== "boolean") {
            throw new SavedSearchValidationError(
                `${key} must be a boolean.`,
            );
        }

        filters[key] = item;
    }

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
  return { ...filters };
}
