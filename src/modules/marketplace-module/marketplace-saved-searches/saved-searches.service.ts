import {
    and,
    desc,
    eq,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    savedSearches,
} from "../../../database/schema/index.ts";

import {
    searchMarketplace,
} from "../marketplace.service.ts";

import type {
    MarketplaceFilters,
} from "../marketplace.types.ts";
import { CreateSavedSearchInput, SavedSearchFilters, SavedSearchRecord, UpdateSavedSearchInput } from "./saved-searches.types.ts";

export class SavedSearchNotFoundError extends Error {
    constructor() {
        super("Saved search not found.");
        this.name = "SavedSearchNotFoundError";
    }
}

function toJsonFilters(
    filters: SavedSearchFilters,
): Record<string, unknown> {
    return { ...filters };
}

/**
 * Normalize saved-search filters.
 *
 * Handles legacy condition values created before
 * KARMASS introduced the three vehicle categories.
 */
function normalizeSavedSearchFilters(
    filters: unknown,
): SavedSearchFilters {
    if (
        typeof filters !== "object"
        || filters === null
        || Array.isArray(filters)
    ) {
        return {};
    }

    const normalized = {
        ...(filters as Record<string, unknown>),
    };

    if (normalized.condition === "NEW") {
        normalized.condition = "BRAND_NEW";
    }

    if (normalized.condition === "USED") {
        normalized.condition = "NIGERIAN_USED";
    }

    const allowedConditions = [
        "BRAND_NEW",
        "FOREIGN_USED",
        "NIGERIAN_USED",
    ];

    if (
        normalized.condition !== undefined
        && !allowedConditions.includes(
            normalized.condition as string,
        )
    ) {
        delete normalized.condition;
    }

    return normalized as SavedSearchFilters;
}

function toSavedSearchRecord(
    record: typeof savedSearches.$inferSelect,
): SavedSearchRecord {
    return {
        id: record.id,
        userId: record.userId,
        name: record.name,
        filters: normalizeSavedSearchFilters(
            record.filters
        ),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
}

/**
 * Create a saved search for a specific user.
 */
export async function createSavedSearch(
    userId: string,
    input: CreateSavedSearchInput,
): Promise<SavedSearchRecord> {
    const [record] = await db
        .insert(savedSearches)
        .values({
            userId,
            name: input.name,
            filters: toJsonFilters(input.filters),
        })
        .returning();

    if (!record) {
        throw new Error("Failed to create saved search.");
    }

    return toSavedSearchRecord(record);
}

/**
 * Retrieve all saved searches belonging to a user.
 */
export async function listSavedSearches(
    userId: string,
): Promise<SavedSearchRecord[]> {
    const records = await db
        .select()
        .from(savedSearches)
        .where(eq(savedSearches.userId, userId))
        .orderBy(desc(savedSearches.createdAt));

    return records.map(toSavedSearchRecord);
}

/**
 * Retrieve one saved search, ensuring that it belongs
 * to the authenticated user.
 */
export async function getSavedSearch(
    userId: string,
    savedSearchId: string,
): Promise<SavedSearchRecord> {
    const [record] = await db
        .select()
        .from(savedSearches)
        .where(
            and(
                eq(savedSearches.id, savedSearchId),
                eq(savedSearches.userId, userId),
            ),
        )
        .limit(1);

    if (!record) {
        throw new SavedSearchNotFoundError();
    }

    return toSavedSearchRecord(record);
}

/**
 * Update a saved search owned by the authenticated user.
 */
export async function updateSavedSearch(
    userId: string,
    savedSearchId: string,
    input: UpdateSavedSearchInput,
): Promise<SavedSearchRecord> {
    const updates: {
        name?: string;
        filters?: Record<string, unknown>;
        updatedAt: Date;
    } = {
        updatedAt: new Date(),
    };

    if (input.name !== undefined) {
        updates.name = input.name;
    }

    if (input.filters !== undefined) {
        updates.filters = toJsonFilters(input.filters);
    }

    const [record] = await db
        .update(savedSearches)
        .set(updates)
        .where(
            and(
                eq(savedSearches.id, savedSearchId),
                eq(savedSearches.userId, userId),
            ),
        )
        .returning();

    if (!record) {
        throw new SavedSearchNotFoundError();
    }

    return toSavedSearchRecord(record);
}

/**
 * Delete a saved search owned by the authenticated user.
 */
export async function deleteSavedSearch(
    userId: string,
    savedSearchId: string,
): Promise<void> {
    const [record] = await db
        .delete(savedSearches)
        .where(
            and(
                eq(savedSearches.id, savedSearchId),
                eq(savedSearches.userId, userId),
            ),
        )
        .returning({
            id: savedSearches.id,
        });

    if (!record) {
        throw new SavedSearchNotFoundError();
    }
}

/**
 * Execute a saved search against the current marketplace.
 *
 * Pagination is deliberately supplied at execution time
 * instead of being persisted with the saved filters.
 */
export async function executeSavedSearch(
    userId: string,
    savedSearchId: string,
    pagination: {
        page: number;
        limit: number;
    },
) {
    const savedSearch = await getSavedSearch(
        userId,
        savedSearchId,
    );

    const filters: MarketplaceFilters = {
        ...normalizeSavedSearchFilters(
            savedSearch.filters,
        ),

        page: pagination.page,
        limit: pagination.limit,
    };

    return searchMarketplace(filters);
}