import {
    listings,
    users,
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

    boostedOnly?: boolean;
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

    /**
     * Catalogue information is optional.
     *
     * Manual vehicle listings do not have to reference
     * a vehicle make, model, generation or variant.
     *
     * The listing snapshot contains their vehicle details.
     */
    make: typeof vehicleMakes.$inferSelect | null;

    model: typeof vehicleModels.$inferSelect | null;

    generation: typeof vehicleGenerations.$inferSelect | null;

    variant: typeof vehicleVariants.$inferSelect | null;

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