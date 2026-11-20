import { env } from "../../../config/env.ts";

export type VehicleProvider =
    | "auto_dev"
    | "karmass"
    | "manual";

export interface ExternalVehicleOption {
    value: string;
    label: string;
    source: VehicleProvider;
}

interface VehicleCatalogue {
    [make: string]: string[];
}

interface CacheEntry<T> {
    value: T;
    expiresAt: number;
}

class VehicleProviderError extends Error {
    constructor(
        message: string,
        public readonly provider: string,
        public readonly status?: number,
        public readonly code?: string,
    ) {
        super(message);

        this.name = "VehicleProviderError";
    }
}

const AUTO_DEV_BASE_URL =
    "https://auto.dev/api";

const CATALOGUE_CACHE_TTL_MS =
    12 * 60 * 60 * 1000;

const MINIMUM_VEHICLE_YEAR = 1950;

const catalogueCache = new Map<
    string,
    CacheEntry<VehicleCatalogue>
>();

const pendingRequests = new Map<
    string,
    Promise<VehicleCatalogue>
>();

/**
 * Normalize a vehicle name for comparison.
 */
function normalizeName(value: string): string {
    return value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

/**
 * Sort and remove duplicate strings.
 */
function sortOptions(values: string[]): string[] {
    return [
        ...new Set(
            values
                .map((value) => value.trim())
                .filter(Boolean),
        ),
    ].sort((a, b) =>
        a.localeCompare(
            b,
            undefined,
            { numeric: true },
        ),
    );
}

/**
 * Validate an object.
 */
function asRecord(
    value: unknown,
): Record<string, unknown> {
    if (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
    ) {
        return value as Record<string, unknown>;
    }

    return {};
}

/**
 * Fetch JSON from Auto.dev.
 */
async function requestAutoDev<T>(
    path: string,
): Promise<T> {
    if (!env.AUTO_DEV_API_KEY) {
        throw new VehicleProviderError(
            "Auto.dev API key is not configured.",
            "auto_dev",
        );
    }

    const controller = new AbortController();

    const timeout = setTimeout(
        () => controller.abort(),
        env.VEHICLE_PROVIDER_TIMEOUT_MS,
    );

    try {
        const response = await fetch(
            `${AUTO_DEV_BASE_URL}${path}`,
            {
                method: "GET",

                headers: {
                    Accept: "application/json",

                    Authorization:
                        `Bearer ${env.AUTO_DEV_API_KEY}`,
                },

                signal: controller.signal,
            },
        );

        const rawBody = await response.text();

        let payload: unknown;

        try {
            payload = rawBody
                ? JSON.parse(rawBody)
                : {};
        } catch {
            throw new VehicleProviderError(
                "Auto.dev returned an invalid JSON response.",
                "auto_dev",
                response.status,
            );
        }

        const record = asRecord(payload);

        if (!response.ok) {
            const error = asRecord(record.error);

            const message =
                typeof error.message === "string"
                    ? error.message
                    : typeof record.message === "string"
                        ? record.message
                        : `Auto.dev returned HTTP ${response.status}.`;

            const code =
                typeof error.code === "string"
                    ? error.code
                    : undefined;

            throw new VehicleProviderError(
                message,
                "auto_dev",
                response.status,
                code,
            );
        }

        return payload as T;

    } catch (error) {
        if (error instanceof VehicleProviderError) {
            throw error;
        }

        if (
            error instanceof Error &&
            error.name === "AbortError"
        ) {
            throw new VehicleProviderError(
                "Auto.dev request timed out.",
                "auto_dev",
            );
        }

        throw new VehicleProviderError(
            error instanceof Error
                ? error.message
                : "Unable to connect to Auto.dev.",
            "auto_dev",
        );

    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Download and normalize the complete make/model catalogue.
 */
async function fetchVehicleCatalogue(): Promise<VehicleCatalogue> {
    const payload = await requestAutoDev<unknown>(
        "/models",
    );

    const record = asRecord(payload);

    const catalogue: VehicleCatalogue = {};

    for (const [make, models] of Object.entries(record)) {
        if (
            typeof make !== "string" ||
            !Array.isArray(models)
        ) {
            continue;
        }

        const normalizedModels = sortOptions(
            models.filter(
                (model): model is string =>
                    typeof model === "string",
            ),
        );

        if (normalizedModels.length === 0) {
            continue;
        }

        catalogue[make.trim()] = normalizedModels;
    }

    if (Object.keys(catalogue).length === 0) {
        throw new VehicleProviderError(
            "Auto.dev returned an empty or invalid vehicle catalogue.",
            "auto_dev",
        );
    }

    return catalogue;
}

/**
 * Retrieve the catalogue with caching and
 * protection against simultaneous duplicate requests.
 */
async function getVehicleCatalogue(): Promise<VehicleCatalogue> {
    const cacheKey = "auto_dev:vehicle_catalogue";

    const cached = catalogueCache.get(cacheKey);

    if (
        cached &&
        cached.expiresAt > Date.now()
    ) {
        return cached.value;
    }

    const pending = pendingRequests.get(cacheKey);

    if (pending) {
        return pending;
    }

    const request = fetchVehicleCatalogue();

    pendingRequests.set(cacheKey, request);

    try {
        const catalogue = await request;

        catalogueCache.set(cacheKey, {
            value: catalogue,
            expiresAt:
                Date.now() + CATALOGUE_CACHE_TTL_MS,
        });

        return catalogue;

    } finally {
        pendingRequests.delete(cacheKey);
    }
}

/**
 * Generate available vehicle years locally.
 */
function generateVehicleYears(): string[] {
    const currentYear = new Date().getFullYear();

    const years: string[] = [];

    for (
        let year = MINIMUM_VEHICLE_YEAR;
        year <= currentYear + 1;
        year++
    ) {
        years.push(String(year));
    }

    return years.reverse();
}

/**
 * Get vehicle provider status.
 */
export function getVehicleProviderStatus() {
    return {
        auto_dev: {
            configured: Boolean(env.AUTO_DEV_API_KEY),

            capabilities: [
                "makes",
                "models",
            ],

            cacheDurationHours: 12,
        },

        karmass: {
            configured: true,

            capabilities: [
                "years",
            ],
        },

        manual: {
            configured: true,

            capabilities: [
                "variants",
                "trims",
                "vehicle-specifications",
            ],
        },
    };
}

/**
 * STEP 1:
 * Get available vehicle years.
 */
export async function getExternalVehicleYears(): Promise<
    ExternalVehicleOption[]
> {
    return generateVehicleYears().map((value) => ({
        value,
        label: value,
        source: "karmass",
    }));
}

/**
 * STEP 2:
 * Get available vehicle makes.
 */
export async function getExternalMakes(
    _year: number,
): Promise<ExternalVehicleOption[]> {
    const catalogue = await getVehicleCatalogue();

    return sortOptions(
        Object.keys(catalogue),
    ).map((value) => ({
        value,
        label: value,
        source: "auto_dev",
    }));
}

/**
 * STEP 3:
 * Get available models for a selected make.
 */
export async function getExternalModels(
    _year: number,
    make: string,
): Promise<ExternalVehicleOption[]> {
    const normalizedMake = normalizeName(make);

    if (!normalizedMake) {
        return [];
    }

    const catalogue = await getVehicleCatalogue();

    const matchingMake = Object.keys(catalogue).find(
        (catalogueMake) =>
            normalizeName(catalogueMake) === normalizedMake,
    );

    if (!matchingMake) {
        return [];
    }

    const models = catalogue[matchingMake];

    if (!models) {
        return [];
    }

    return models.map((value) => ({
        value,
        label: value,
        source: "auto_dev",
    }));
}

/**
 * STEP 4:
 * Variants and trims are entered manually.
 *
 * Auto.dev's general Models endpoint does not
 * provide a year-specific trim catalogue.
 */
export async function getExternalVehicleOptions(
    _dimension: "variants" | "trims",
    _filters: {
        year: number;
        make: string;
        model: string;
    },
): Promise<ExternalVehicleOption[]> {
    return [];
}