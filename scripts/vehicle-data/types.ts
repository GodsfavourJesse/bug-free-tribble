export type VehicleResearchSourceType =
    | "MANUFACTURER"
    | "GOVERNMENT"
    | "TECHNICAL_DOCUMENT"
    | "AUTOMOTIVE_PUBLICATION"
    | "OTHER";

export type VehicleVerificationStatus =
    | "PENDING"
    | "VERIFIED"
    | "DISPUTED"
    | "REJECTED";

export type VehicleFuelType =
    | "PETROL"
    | "DIESEL"
    | "HYBRID"
    | "PLUG_IN_HYBRID"
    | "ELECTRIC"
    | "CNG"
    | "LPG";

export type VehicleTransmission =
    | "MANUAL"
    | "AUTOMATIC"
    | "CVT"
    | "DCT"
    | "AMT";

export type VehicleDriveType =
    | "FWD"
    | "RWD"
    | "AWD"
    | "FOUR_WD";

export type VehicleBodyStyle =
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

export interface VehicleResearchSource {
    name: string;
    url: string;

    sourceType: VehicleResearchSourceType;

    licenseName?: string | undefined;
    licenseUrl?: string | undefined;

    attributionRequired?: boolean | undefined;
    attributionText?: string | undefined;

    reuseNotes?: string | undefined;

    accessedAt?: string | undefined;

    verificationStatus: VehicleVerificationStatus;

    verificationNotes?: string | undefined;
}

export interface VehicleEngineSeed {
    name: string;
    slug: string;

    engineCode?: string | undefined;

    displacementCc?: number | undefined;
    cylinders?: number | undefined;
    horsepower?: number | undefined;

    configuration?: string | undefined;
    cylinderLayout?: string | undefined;

    valves?: number | undefined;
    valvesPerCylinder?: number | undefined;

    valveTrain?: string | undefined;
    aspiration?: string | undefined;
    fuelSystem?: string | undefined;

    powerKw?: number | undefined;
    powerRpm?: number | undefined;

    torqueNm?: number | undefined;
    torqueRpm?: number | undefined;

    compressionRatio?: number | undefined;

    boreMm?: number | undefined;
    strokeMm?: number | undefined;

    hybridSystem?: string | undefined;

    motorPowerKw?: number | undefined;
    batteryCapacityKwh?: number | undefined;
    electricRangeKm?: number | undefined;

    aliases?: string[] | undefined;

    additionalSpecifications?:
        | Record<string, unknown>
        | undefined;

    sources: VehicleResearchSource[];
}

export interface VehicleVariantSeed {
    name: string;
    slug: string;

    trimCode?: string | undefined;

    year: number;

    engineSlug?: string | undefined;

    fuelType?: VehicleFuelType | undefined;
    transmission?: VehicleTransmission | undefined;
    driveType?: VehicleDriveType | undefined;
    bodyStyle?: VehicleBodyStyle | undefined;

    horsepower?: number | undefined;
    seats?: number | undefined;
    doors?: number | undefined;

    topSpeedKph?: number | undefined;
    acceleration0To100Seconds?: number | undefined;

    fuelConsumptionCityL100Km?: number | undefined;
    fuelConsumptionHighwayL100Km?: number | undefined;
    fuelConsumptionCombinedL100Km?: number | undefined;

    batteryCapacityKwh?: number | undefined;
    electricRangeKm?: number | undefined;
    chargingPowerKw?: number | undefined;

    curbWeightKg?: number | undefined;
    grossWeightKg?: number | undefined;
    towingCapacityKg?: number | undefined;

    lengthMm?: number | undefined;
    widthMm?: number | undefined;
    heightMm?: number | undefined;
    wheelbaseMm?: number | undefined;
    groundClearanceMm?: number | undefined;

    fuelTankCapacityLitres?: number | undefined;
    cargoCapacityLitres?: number | undefined;

    tyreSizes?: string[] | undefined;

    equipment?: string[] | undefined;

    additionalSpecifications?:
        | Record<string, unknown>
        | undefined;

    markets: string[];

    sources: VehicleResearchSource[];
}

export interface VehicleModelYearSeed {
    year: number;

    markets: string[];
}

export interface VehicleGenerationSeed {
    name: string;
    slug: string;

    chassisCode?: string | undefined;
    platformCode?: string | undefined;

    startYear?: number | undefined;
    endYear?: number | undefined;

    aliases?: string[] | undefined;

    bodyStyles?: VehicleBodyStyle[] | undefined;

    markets: string[];

    engines: VehicleEngineSeed[];

    modelYears: VehicleModelYearSeed[];

    variants: VehicleVariantSeed[];

    sources: VehicleResearchSource[];
}

export interface VehicleModelSeed {
    name: string;
    slug: string;

    aliases?: string[] | undefined;

    generations: VehicleGenerationSeed[];

    sources: VehicleResearchSource[];
}

export interface VehicleMakeSeed {
    name: string;
    slug: string;

    countryOfOrigin?: string | undefined;

    aliases?: string[] | undefined;

    models: VehicleModelSeed[];

    sources: VehicleResearchSource[];
}

export interface VehicleCatalogSeedFile {
    schemaVersion: 1;

    manufacturer: VehicleMakeSeed;
}