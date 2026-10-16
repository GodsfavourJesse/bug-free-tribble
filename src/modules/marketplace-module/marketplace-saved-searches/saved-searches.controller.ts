import type {
    Request,
    Response,
} from "express";

import {
    createSavedSearch,
    deleteSavedSearch,
    executeSavedSearch,
    getSavedSearch,
    listSavedSearches,
    SavedSearchNotFoundError,
    updateSavedSearch,
} from "./saved-searches.service.ts";

import {
    parseCreateSavedSearch,
    parseUpdateSavedSearch,
    SavedSearchValidationError,
} from "./saved-searches.validation.ts";

function getAuthenticatedUserId(
    request: Request,
): string | null {
    const user = request.user;

    if (!user || typeof user.id !== "string") {
        return null;
    }

    return user.id;
}

function getSavedSearchId(
    request: Request,
): string | null {
    const id = request.params.id;

    if (typeof id !== "string" || id.trim().length === 0) {
        return null;
    }

    return id;
}

function handleControllerError(
    error: unknown,
    response: Response,
): void {
    if (error instanceof SavedSearchValidationError) {
        response.status(400).json({
            success: false,
            message: error.message,
        });
        return;
    }

    if (error instanceof SavedSearchNotFoundError) {
        response.status(404).json({
            success: false,
            message: error.message,
        });
        return;
    }

    response.status(500).json({
        success: false,
        message: "An unexpected error occurred.",
    });
}

/**
 * POST /saved-searches
 *
 * Create a saved search.
 */
export async function createSavedSearchController(
    request: Request,
    response: Response,
): Promise<void> {
    const userId = getAuthenticatedUserId(request);

    if (!userId) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });
        return;
    }

    try {
        const input = parseCreateSavedSearch(request.body);

        const savedSearch = await createSavedSearch(
            userId,
            input,
        );

        response.status(201).json({
            success: true,
            message: "Saved search created successfully.",
            data: savedSearch,
        });
    } catch (error) {
        handleControllerError(error, response);
    }
}

/**
 * GET /saved-searches
 *
 * Retrieve the authenticated user's saved searches.
 */
export async function listSavedSearchesController(
    request: Request,
    response: Response,
): Promise<void> {
    const userId = getAuthenticatedUserId(request);

    if (!userId) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });
        return;
    }

    try {
        const savedSearches = await listSavedSearches(userId);

        response.status(200).json({
            success: true,
            data: savedSearches,
        });
    } catch (error) {
        handleControllerError(error, response);
    }
}

/**
 * GET /saved-searches/:id
 *
 * Retrieve one saved search.
 */
export async function getSavedSearchController(
    request: Request,
    response: Response,
): Promise<void> {
    const userId = getAuthenticatedUserId(request);
    const savedSearchId = getSavedSearchId(request);

    if (!userId) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });
        return;
    }

    if (!savedSearchId) {
        response.status(400).json({
            success: false,
            message: "A valid saved search ID is required.",
        });
        return;
    }

    try {
        const savedSearch = await getSavedSearch(
            userId,
            savedSearchId,
        );

        response.status(200).json({
            success: true,
            data: savedSearch,
        });
    } catch (error) {
        handleControllerError(error, response);
    }
}

/**
 * PATCH /saved-searches/:id
 *
 * Update a saved search's name or filters.
 */
export async function updateSavedSearchController(
    request: Request,
    response: Response,
): Promise<void> {
    const userId = getAuthenticatedUserId(request);
    const savedSearchId = getSavedSearchId(request);

    if (!userId) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });
        return;
    }

    if (!savedSearchId) {
        response.status(400).json({
            success: false,
            message: "A valid saved search ID is required.",
        });
        return;
    }

    try {
        const input = parseUpdateSavedSearch(request.body);

        const savedSearch = await updateSavedSearch(
            userId,
            savedSearchId,
            input,
        );

        response.status(200).json({
            success: true,
            message: "Saved search updated successfully.",
            data: savedSearch,
        });
    } catch (error) {
        handleControllerError(error, response);
    }
}

/**
 * DELETE /saved-searches/:id
 *
 * Delete a saved search.
 */
export async function deleteSavedSearchController(
    request: Request,
    response: Response,
): Promise<void> {
    const userId = getAuthenticatedUserId(request);
    const savedSearchId = getSavedSearchId(request);

    if (!userId) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });
        return;
    }

    if (!savedSearchId) {
        response.status(400).json({
            success: false,
            message: "A valid saved search ID is required.",
        });
        return;
    }

    try {
        await deleteSavedSearch(
            userId,
            savedSearchId,
        );

        response.status(200).json({
            success: true,
            message: "Saved search deleted successfully.",
        });
    } catch (error) {
        handleControllerError(error, response);
    }
}

/**
 * GET /saved-searches/:id/results
 *
 * Execute a saved search against current marketplace listings.
 */
export async function executeSavedSearchController(
    request: Request,
    response: Response,
): Promise<void> {
    const userId = getAuthenticatedUserId(request);
    const savedSearchId = getSavedSearchId(request);

    if (!userId) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });
        return;
    }

    if (!savedSearchId) {
        response.status(400).json({
            success: false,
            message: "A valid saved search ID is required.",
        });
        return;
    }

    try {
        const rawPage = request.query.page;
        const rawLimit = request.query.limit;

        const page = rawPage === undefined
            ? 1
            : Number(rawPage);

        const limit = rawLimit === undefined
            ? 20
            : Number(rawLimit);

        if (
            !Number.isInteger(page) ||
            page < 1 ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 100
        ) {
            response.status(400).json({
                success: false,
                message:
                    "Page must be a positive integer and limit must be between 1 and 100.",
            });
            return;
        }

        const results = await executeSavedSearch(
            userId,
            savedSearchId,
            {
                page,
                limit,
            },
        );

        response.status(200).json({
            success: true,
            data: results,
        });
    } catch (error) {
        handleControllerError(error, response);
    }
}