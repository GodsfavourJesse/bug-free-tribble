import { listings, vehicleGenerations, vehicleMakes, vehicleModels, vehicleVariants } from "../../database/schema/index.ts";

export type MarketplaceSort =
    | "newest"
    | "price_asc"
    | "price_desc"
    | "relevance";

export type MarketplaceFuelType =
    | "PETROL"
    | "DIESEL"
    | "HYBRID"
    | "PLUG_IN_HYBRID"
    | "ELECTRIC"
    | "CNG"
    | "LPG";

export type MarketplaceTransmission =
    | "MANUAL"
    | "AUTOMATIC"
    | "CVT"
    | "DCT"
    | "AMT";

export type MarketplaceBodyStyle =
    | "SEDAN"
    | "SUV"
    | "COUPE"
    | "HATCHBACK"
    | "WAGON"
    | "MPV"
    | "PICKUP"
    | "VAN"
    | "CONVERTIBLE"
    | "TRUCK"
    | "BUS";

export interface MarketplaceFilters {
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

    page: number;
    limit: number;

    sort?: MarketplaceSort;
}

export interface MarketplacePagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
}

export interface MarketplaceSearchResult {
    listings: Array<{
        listing: typeof listings.$inferSelect;
        make: typeof vehicleMakes.$inferSelect;
        model: typeof vehicleModels.$inferSelect;
        generation: typeof vehicleGenerations.$inferSelect;
        variant: typeof vehicleVariants.$inferSelect;
        boostPriority: number;
    }>;

    pagination: MarketplacePagination;
}

export interface MarketplaceSearchProvider {
    search(
        filters: MarketplaceFilters,
    ): Promise<MarketplaceSearchResult>;
}