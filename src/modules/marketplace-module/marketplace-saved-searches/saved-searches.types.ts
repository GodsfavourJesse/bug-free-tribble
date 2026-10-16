import { MarketplaceBodyStyle, MarketplaceFuelType, MarketplaceSort, MarketplaceTransmission } from "../marketplace.types.ts";

export interface SavedSearchFilters {
    q?: string;

    makeId?: string;
    modelId?: string;
    variantId?: string;

    minPrice?: number;
    maxPrice?: number;

    minMileage?: number;
    maxMileage?: number;

    minYear?: number;
    maxYear?: number;

    fuelType?: MarketplaceFuelType;
    transmission?: MarketplaceTransmission;
    bodyStyle?: MarketplaceBodyStyle;

    condition?: "NEW" | "USED";

    state?: string;
    city?: string;

    dealerOnly?: boolean;
    verifiedDealerOnly?: boolean;

    sort?: MarketplaceSort;

}

export interface CreateSavedSearchInput {
    name: string;
    filters: SavedSearchFilters;
}

export interface UpdateSavedSearchInput {
    name?: string;
    filters?: SavedSearchFilters;
}

export const allowedFilterKeys = new Set([
    "q",
    "makeId",
    "modelId",
    "variantId",
    "minPrice",
    "maxPrice",
    "minMileage",
    "maxMileage",
    "minYear",
    "maxYear",
    "fuelType",
    "transmission",
    "bodyStyle",
    "condition",
    "state",
    "city",
    "dealerOnly",
    "verifiedDealerOnly",
    "sort",
]);

export const supportedSorts = [
    "newest",
    "price_asc",
    "price_desc",
    "relevance",
] as const satisfies readonly MarketplaceSort[];

export const supportedFuelTypes = [
    "PETROL",
    "DIESEL",
    "HYBRID",
    "PLUG_IN_HYBRID",
    "ELECTRIC",
    "CNG",
    "LPG",
] as const satisfies readonly MarketplaceFuelType[];

export const supportedTransmissions = [
    "MANUAL",
    "AUTOMATIC",
    "CVT",
    "DCT",
    "AMT",
] as const satisfies readonly MarketplaceTransmission[];

export const supportedBodyStyles = [
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

export interface SavedSearchRecord {
    id: string;
    userId: string;
    name: string;
    filters: SavedSearchFilters;
    createdAt: Date;
    updatedAt: Date;
}