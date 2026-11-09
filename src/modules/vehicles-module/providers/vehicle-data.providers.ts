import { env } from "../../../config/env.ts";

export type VehicleProvider = "carsxe" | "vehiclesdb";
export type CarsXeDimension = "years" | "makes" | "models" | "trims" | "variants";

export interface ExternalVehicleOption {
    value: string;
    label: string;
    source: VehicleProvider;
}


const CARSXE_BASE_URL = "https://api.carsxe.com/v1/ymm-options";
const VEHICLESDB_BASE_URL = "https://vehiclesdb.com/api/v1";
const optionCache = new Map<string, { expiresAt: number; value: ExternalVehicleOption[] }>();
const OPTION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

async function cachedOptions(
    key: string,
    loader: () => Promise<ExternalVehicleOption[]>,
): Promise<ExternalVehicleOption[]> {
    const cached = optionCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const value = await loader();
    optionCache.set(key, { value, expiresAt: Date.now() + OPTION_CACHE_TTL_MS });
    return value;
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
}

function extractStringOptions(payload: unknown, keys: string[], depth = 0): string[] {
    if (depth > 3) return [];
    const record = asRecord(payload);
    for (const key of keys) {
        const value = record[key];
        if (Array.isArray(value)) {
            return value
                .map((item) => {
                    if (typeof item === "string" || typeof item === "number") return String(item);
                    const itemRecord = asRecord(item);
                    const nestedMake = asRecord(itemRecord.make);
                    const candidate = itemRecord.name ?? itemRecord.label ?? itemRecord.value ?? nestedMake.name;
                    return typeof candidate === "string" || typeof candidate === "number" ? String(candidate) : "";
                })
                .map((item) => item.trim())
                .filter(Boolean);
        }
        if (value && typeof value === "object") {
            const nested = extractStringOptions(value, keys, depth + 1);
            if (nested.length) return nested;
        }
    }
    return [];
}

async function requestJson(url: URL, headers: Record<string, string> = {}): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.VEHICLE_PROVIDER_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            method: "GET",
            headers: { Accept: "application/json", ...headers },
            signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => ({}));
        if (!response.ok) {
            const message = asRecord(payload).message;
            throw new Error(typeof message === "string" ? message : `Vehicle provider returned HTTP ${response.status}.`);
        }
        return payload;
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new Error("Vehicle data provider timed out. Please try again.");
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

async function carsXeOptions(
    dimension: CarsXeDimension,
    filters: { make?: string; model?: string; year?: number },
): Promise<string[]> {
    if (!env.CARSXE_API_KEY) throw new Error("CarsXE is not configured. Add CARSXE_API_KEY to the backend environment.");

    const url = new URL(CARSXE_BASE_URL);
    url.searchParams.set("key", env.CARSXE_API_KEY);
    url.searchParams.set("dimension", dimension);
    if (filters.make) url.searchParams.set("make", filters.make);
    if (filters.model) url.searchParams.set("model", filters.model);
    if (filters.year) url.searchParams.set("year", String(filters.year));

    const payload = await requestJson(url);
    const record = asRecord(payload);
    if (record.success === false) {
        throw new Error(typeof record.message === "string" ? record.message : "CarsXE could not return vehicle options.");
    }
    const options = extractStringOptions(payload, [dimension, "options", "results", "data"]);
    return [...new Set(options)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function vehiclesDbMakes(): Promise<string[]> {
    if (!env.VEHICLESDB_API_KEY) throw new Error("VehiclesDB is not configured. Add VEHICLESDB_API_KEY to the backend environment.");
    const url = new URL(`${VEHICLESDB_BASE_URL}/makes`);
    url.searchParams.set("kind", "car");
    const payload = await requestJson(url, { Authorization: `Bearer ${env.VEHICLESDB_API_KEY}` });
    const record = asRecord(payload);
    const direct = extractStringOptions(payload, ["makes", "data", "results"]);
    if (direct.length) return direct;
    if (Array.isArray(record.data)) return extractStringOptions({ makes: record.data }, ["makes"]);
    return [];
}

async function vehiclesDbModels(make: string): Promise<string[]> {
    if (!env.VEHICLESDB_API_KEY) throw new Error("VehiclesDB is not configured. Add VEHICLESDB_API_KEY to the backend environment.");
    const slug = make.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const url = new URL(`${VEHICLESDB_BASE_URL}/makes/${encodeURIComponent(slug)}/models`);
    url.searchParams.set("kind", "car");
    const payload = await requestJson(url, { Authorization: `Bearer ${env.VEHICLESDB_API_KEY}` });
    return extractStringOptions(payload, ["models", "data", "results"]);
}

export function getVehicleProviderStatus() {
    return {
        carsxe: { configured: Boolean(env.CARSXE_API_KEY), capabilities: ["years", "makes", "models", "variants", "trims"] },
        vehiclesdb: { configured: Boolean(env.VEHICLESDB_API_KEY), capabilities: ["makes", "models", "vehicle-resolution", "vehicle-records"] },
    };
}

export async function getExternalMakes(provider: VehicleProvider = "carsxe"): Promise<ExternalVehicleOption[]> {
    return cachedOptions(`makes:${provider}`, async () => {
        const values = provider === "carsxe"
            ? await carsXeOptions("makes", {})
            : await vehiclesDbMakes();
        return values.map((value) => ({ value, label: value, source: provider }));
    });
}

export async function getExternalModels(make: string, provider: VehicleProvider = "carsxe"): Promise<ExternalVehicleOption[]> {
    return cachedOptions(`models:${provider}:${make.toLowerCase()}`, async () => {
        const values = provider === "carsxe"
            ? await carsXeOptions("models", { make })
            : await vehiclesDbModels(make);
        return values.map((value) => ({ value, label: value, source: provider }));
    });
}

export async function getExternalVehicleOptions(
    dimension: Exclude<CarsXeDimension, "makes" | "models">,
    filters: { make?: string; model?: string; year?: number },
): Promise<ExternalVehicleOption[]> {
    const key = `carsxe:${dimension}:${filters.make ?? ""}:${filters.model ?? ""}:${filters.year ?? ""}`.toLowerCase();
    return cachedOptions(key, async () => {
        const values = await carsXeOptions(dimension, filters);
        return values.map((value) => ({ value, label: value, source: "carsxe" }));
    });
}
