import fs from "node:fs";
import path from "node:path";

import {
    NIGERIAN_STATES,
} from "../../data/constants/nigeria.ts";

import type {
    NigerianLocationCatalogue,
} from "./locations.types.js";

const LOCATION_DATA_PATH = path.resolve(
    process.cwd(),
    "src/data/locations/nigeria-lgas.json"
);

function loadLocationCatalogue(): NigerianLocationCatalogue {
    if (!fs.existsSync(LOCATION_DATA_PATH)) {
        throw new Error(
            `Nigerian location catalogue not found: ${LOCATION_DATA_PATH}`
        );
    }

    const rawData = JSON.parse(
        fs.readFileSync(LOCATION_DATA_PATH, "utf-8")
    );

    if (
        !rawData ||
        typeof rawData !== "object" ||
        Array.isArray(rawData)
    ) {
        throw new Error(
            "Invalid Nigerian location catalogue. Expected an object containing state names and their LGAs. Run generate-nigeria-locations.ts."
        );
    }

    for (const state of NIGERIAN_STATES) {
        if (!Array.isArray(rawData[state])) {
            throw new Error(
                `Invalid location catalogue: missing LGA array for ${state}.`
            );
        }
    }

    return rawData as NigerianLocationCatalogue;
}

const locationCatalogue = loadLocationCatalogue();

function normalizeLocation(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function resolveState(
    state: string
): string | undefined {
    const normalized = normalizeLocation(state);

    return NIGERIAN_STATES.find(
        (item) => normalizeLocation(item) === normalized
    );
}

export function getAllStates(): string[] {
    return [...NIGERIAN_STATES];
}

export function getLgasByState(
    state: string
): string[] | null {
    const canonicalState = resolveState(state);

    if (!canonicalState) {
        return null;
    }

    return locationCatalogue[canonicalState] ?? null;
}

export function isValidState(state: string): boolean {
    return Boolean(resolveState(state));
}

export function isValidLga(
    state: string,
    lga: string
): boolean {
    const lgas = getLgasByState(state);

    if (!lgas) {
        return false;
    }

    const normalizedLga = normalizeLocation(lga);

    return lgas.some(
        (item) => normalizeLocation(item) === normalizedLga
    );
}

export function validateLocation(
    state: string,
    lga?: string | null
): boolean {
    if (!isValidState(state)) {
        return false;
    }

    if (!lga?.trim()) {
        return true;
    }

    return isValidLga(state, lga);
}