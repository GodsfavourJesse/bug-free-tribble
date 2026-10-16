import type {
    Request,
    Response,
} from "express";

import { searchMarketplace } from "./marketplace.service.ts";
import { MarketplaceBodyStyle, MarketplaceFilters, MarketplaceFuelType, MarketplaceSort, MarketplaceTransmission } from "./marketplace.types.ts";

function optionalString(
    value: unknown,
): string | undefined {
    if (
        typeof value !== "string"
        || value.trim() === ""
    ) {
        return undefined;
    }

    return value.trim();
}

function optionalNumber(
    value: unknown,
): number | undefined {
    if (
        typeof value !== "string"
        || value.trim() === ""
    ) {
        return undefined;
    }

    const parsed = Number(value);

    if (
        !Number.isFinite(parsed)
        || parsed < 0
    ) {
        return undefined;
    }

    return parsed;
}

function positiveInteger(
    value: unknown,
    fallback: number,
    maximum: number,
): number {
    if (typeof value !== "string") {
        return fallback;
    }

    const parsed = Number(value);

    if (
        !Number.isInteger(parsed)
        || parsed < 1
    ) {
        return fallback;
    }

    return Math.min(parsed, maximum);
}

function parseBoolean(
    value: unknown,
): boolean | undefined {
    if (value === "true" || value === "1") {
        return true;
    }

    if (value === "false" || value === "0") {
        return false;
    }

    return undefined;
}

function isOneOf<T extends string>(
    value: string | undefined,
    allowed: readonly T[],
): value is T {
    return (
        value !== undefined
        && allowed.some((item) => item === value)
    );
}

const supportedSorts = [
    "newest",
    "price_asc",
    "price_desc",
    "relevance",
] as const satisfies readonly MarketplaceSort[];

const supportedFuelTypes = [
    "PETROL",
    "DIESEL",
    "HYBRID",
    "PLUG_IN_HYBRID",
    "ELECTRIC",
    "CNG",
    "LPG",
] as const satisfies readonly MarketplaceFuelType[];

const supportedTransmissions = [
    "MANUAL",
    "AUTOMATIC",
    "CVT",
    "DCT",
    "AMT",
] as const satisfies readonly MarketplaceTransmission[];

const supportedBodyStyles = [
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
] as const satisfies readonly MarketplaceBodyStyle[];

export async function search(
    request: Request,
    response: Response,
): Promise<void> {
    try {
        const page = positiveInteger(
            request.query.page,
            1,
            Number.MAX_SAFE_INTEGER,
        );

        const limit = positiveInteger(
            request.query.limit,
            20,
            50,
        );

        const minPrice = optionalNumber(
            request.query.minPrice,
        );

        const maxPrice = optionalNumber(
            request.query.maxPrice,
        );

        const minMileage = optionalNumber(
            request.query.minMileage,
        );

        const maxMileage = optionalNumber(
            request.query.maxMileage,
        );

        const minYear = optionalNumber(
            request.query.minYear,
        );

        const maxYear = optionalNumber(
            request.query.maxYear,
        );

        if (
            minPrice !== undefined
            && maxPrice !== undefined
            && minPrice > maxPrice
        ) {
            response.status(400).json({
                success: false,
                message:
                    "Minimum price cannot exceed maximum price.",
            });
            return;
        }

        if (
            minMileage !== undefined
            && maxMileage !== undefined
            && minMileage > maxMileage
        ) {
            response.status(400).json({
                success: false,
                message:
                    "Minimum mileage cannot exceed maximum mileage.",
            });
            return;
        }

        if (
            minYear !== undefined
            && (
                !Number.isInteger(minYear)
                || minYear < 1886
                || minYear > 2100
            )
        ) {
            response.status(400).json({
                success: false,
                message:
                    "minYear must be an integer between 1886 and 2100.",
            });
            return;
        }

        if (
            maxYear !== undefined
            && (
                !Number.isInteger(maxYear)
                || maxYear < 1886
                || maxYear > 2100
            )
        ) {
            response.status(400).json({
                success: false,
                message:
                    "maxYear must be an integer between 1886 and 2100.",
            });
            return;
        }

        if (
            minYear !== undefined
            && maxYear !== undefined
            && minYear > maxYear
        ) {
            response.status(400).json({
                success: false,
                message:
                    "minYear cannot exceed maxYear.",
            });
            return;
        }

        const condition = optionalString(
            request.query.condition,
        );

        if (
            condition !== undefined
            && condition !== "NEW"
            && condition !== "USED"
        ) {
            response.status(400).json({
                success: false,
                message:
                    "condition must be NEW or USED.",
            });
            return;
        }

        const sort = optionalString(
            request.query.sort,
        );

        if (
            sort !== undefined
            && !isOneOf(sort, supportedSorts)
        ) {
            response.status(400).json({
                success: false,
                message:
                    "Unsupported sort. Use newest, price_asc, price_desc, or relevance.",
            });
            return;
        }

        const fuelType = optionalString(
            request.query.fuelType,
        );

        if (
            fuelType !== undefined
            && !isOneOf(fuelType, supportedFuelTypes)
        ) {
            response.status(400).json({
                success: false,
                message:
                    "Unsupported fuelType.",
            });
            return;
        }

        const transmission = optionalString(
            request.query.transmission,
        );

        if (
            transmission !== undefined
            && !isOneOf(
                transmission,
                supportedTransmissions,
            )
        ) {
            response.status(400).json({
                success: false,
                message:
                    "Unsupported transmission.",
            });
            return;
        }

        const bodyStyle = optionalString(
            request.query.bodyStyle,
        );

        if (
            bodyStyle !== undefined
            && !isOneOf(bodyStyle, supportedBodyStyles)
        ) {
            response.status(400).json({
                success: false,
                message:
                    "Unsupported bodyStyle.",
            });
            return;
        }

        const dealerOnly = parseBoolean(
            request.query.dealerOnly,
        );

        const verifiedDealerOnly = parseBoolean(
            request.query.verifiedDealerOnly,
        );

        if (
            request.query.dealerOnly !== undefined
            && dealerOnly === undefined
        ) {
            response.status(400).json({
                success: false,
                message:
                    "dealerOnly must be true, false, 1, or 0.",
            });
            return;
        }

        if (
            request.query.verifiedDealerOnly !== undefined
            && verifiedDealerOnly === undefined
        ) {
            response.status(400).json({
                success: false,
                message:
                    "verifiedDealerOnly must be true, false, 1, or 0.",
            });
            return;
        }

        if (
            verifiedDealerOnly === true
            && dealerOnly === false
        ) {
            response.status(400).json({
                success: false,
                message:
                    "verifiedDealerOnly cannot be combined with dealerOnly=false.",
            });
            return;
        }

        const filters: MarketplaceFilters = {
            page,
            limit,
        };

        const stringFilters = {
            q: optionalString(request.query.q),
            makeId: optionalString(request.query.makeId),
            modelId: optionalString(request.query.modelId),
            variantId: optionalString(request.query.variantId),
            state: optionalString(request.query.state),
            city: optionalString(request.query.city),
        };

        for (const [key, value] of Object.entries(stringFilters)) {
            if (value !== undefined) {
                Object.assign(filters, {
                    [key]: value,
                });
            }
        }

        if (minPrice !== undefined) {
            filters.minPrice = minPrice;
        }

        if (maxPrice !== undefined) {
            filters.maxPrice = maxPrice;
        }

        if (minMileage !== undefined) {
            filters.minMileage = minMileage;
        }

        if (maxMileage !== undefined) {
            filters.maxMileage = maxMileage;
        }

        if (minYear !== undefined) {
            filters.minYear = minYear;
        }

        if (maxYear !== undefined) {
            filters.maxYear = maxYear;
        }

        if (condition === "NEW" || condition === "USED") {
            filters.condition = condition;
        }

        if (fuelType !== undefined && isOneOf(fuelType, supportedFuelTypes)) {
            filters.fuelType = fuelType;
        }

        if (
            transmission !== undefined
            && isOneOf(transmission, supportedTransmissions)
        ) {
            filters.transmission = transmission;
        }

        if (
            bodyStyle !== undefined
            && isOneOf(bodyStyle, supportedBodyStyles)
        ) {
            filters.bodyStyle = bodyStyle;
        }

        if (dealerOnly !== undefined) {
            filters.dealerOnly = dealerOnly;
        }

        if (verifiedDealerOnly !== undefined) {
            filters.verifiedDealerOnly = verifiedDealerOnly;
        }

        if (sort !== undefined && isOneOf(sort, supportedSorts)) {
            filters.sort = sort;
        }

        const result = await searchMarketplace(filters);

        response.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error(
            "[marketplace.search]",
            error,
        );

        response.status(500).json({
            success: false,
            message:
                "Unable to search marketplace listings.",
        });
    }
}