import {
    listings,
    listingImages,
    users,
    dealerProfiles,
    vehicleGenerations,
    vehicleMakes,
    vehicleModels,
    vehicleVariants,
} from "../../database/schema/index.ts";


export type MarketplaceSort =
    | "newest"
    | "price_asc"
    | "price_desc"
    | "relevance";


export type MarketplaceCondition =
    | "BRAND_NEW"
    | "FOREIGN_USED"
    | "NIGERIAN_USED";


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
    generationId?: string;
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

    condition?: MarketplaceCondition;

    state?: string;
    city?: string;

    dealerOnly?: boolean;
    verifiedDealerOnly?: boolean;

    /**
     * Return only listings with an active boost.
     */
    boostedOnly?: boolean;

    /**
     * Exclude listings with an active boost.
     *
     * This should only be used when a dedicated
     * business operation explicitly requires it.
     *
     * Normal marketplace searches must include
     * boosted and non-boosted listings.
     */
    excludeBoosted?: boolean;

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


export interface MarketplaceImage {
    id: string;
    objectKey: string;
    sortOrder: number;
    mimeType: string | null;
    width: number | null;
    height: number | null;
    url: string;
    thumbnailUrl: string;
    detailUrl: string;
}


export interface MarketplaceSeller {
    id: string;
    firstName: string;
    lastName: string;
    displayName: string;
    accountType: typeof users.$inferSelect.accountType;
    avatarUrl: string | null;
    createdAt: Date;
}


export interface MarketplaceDealer {
    companyName: string | null;
    verified: boolean | null;
    verifiedAt: Date | null;
}


export interface MarketplaceSearchItem {
    listing: typeof listings.$inferSelect;

    make: typeof vehicleMakes.$inferSelect;

    model: typeof vehicleModels.$inferSelect;

    generation: typeof vehicleGenerations.$inferSelect;

    variant: typeof vehicleVariants.$inferSelect;

    seller: MarketplaceSeller;

    dealer: MarketplaceDealer | null;

    images: MarketplaceImage[];

    boostPriority: number;
}


export interface MarketplaceSearchResult {
    listings: MarketplaceSearchItem[];

    pagination: MarketplacePagination;
}


export interface MarketplaceSearchProvider {
    search(
        filters: MarketplaceFilters,
    ): Promise<MarketplaceSearchResult>;
}