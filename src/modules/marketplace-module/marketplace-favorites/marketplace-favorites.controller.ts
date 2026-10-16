import type {
    Request,
    Response,
} from "express";

import {
    addFavorite,
    isFavorite,
    listFavorites,
    removeFavorite,
} from "./marketplace-favorites.service.ts";

function getAuthenticatedUserId(
    request: Request,
): string | null {
    return request.user?.id ?? null;
}

function isValidUuid(
    value: string,
): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(value);
}

function parsePositiveInteger(
    value: unknown,
    fallback: number,
    maximum: number,
): number {
    if (typeof value !== "string") {
        return fallback;
    }

    const parsed = Number(value);

    if (
        !Number.isSafeInteger(parsed)
        || parsed < 1
    ) {
        return fallback;
    }

    return Math.min(parsed, maximum);
}

function getListingId(
    request: Request,
    response: Response,
): string | null {
    const listingId = request.params.listingId;

    if (
        typeof listingId !== "string"
        || !isValidUuid(listingId)
    ) {
        response.status(400).json({
            success: false,
            message: "A valid listing ID is required.",
        });

        return null;
    }

    return listingId;
}

export async function createFavorite(
    request: Request,
    response: Response,
): Promise<void> {
    try {
        const userId = getAuthenticatedUserId(request);

        if (!userId) {
            response.status(401).json({
                success: false,
                message: "Authentication required.",
            });

            return;
        }

        const listingId = getListingId(
            request,
            response,
        );

        if (!listingId) {
            return;
        }

        const favorite = await addFavorite(
            userId,
            listingId,
        );

        if (!favorite) {
            response.status(404).json({
                success: false,
                message:
                    "Listing not found or unavailable.",
            });

            return;
        }

        response.status(200).json({
            success: true,
            message: "Listing added to favorites.",
            data: {
                favorite,
            },
        });
    } catch (error) {
        console.error(
            "[marketplace.favorites.create]",
            error,
        );

        response.status(500).json({
            success: false,
            message: "Unable to add favorite.",
        });
    }
}

export async function deleteFavorite(
    request: Request,
    response: Response,
): Promise<void> {
    try {
        const userId = getAuthenticatedUserId(request);

        if (!userId) {
            response.status(401).json({
                success: false,
                message: "Authentication required.",
            });

            return;
        }

        const listingId = getListingId(
            request,
            response,
        );

        if (!listingId) {
            return;
        }

        const removed = await removeFavorite(
            userId,
            listingId,
        );

        response.status(200).json({
            success: true,
            message: removed
                ? "Listing removed from favorites."
                : "Listing was not in your favorites.",
            data: {
                removed,
            },
        });
    } catch (error) {
        console.error(
            "[marketplace.favorites.delete]",
            error,
        );

        response.status(500).json({
            success: false,
            message: "Unable to remove favorite.",
        });
    }
}

export async function getFavoriteStatus(
    request: Request,
    response: Response,
): Promise<void> {
    try {
        const userId = getAuthenticatedUserId(request);

        if (!userId) {
            response.status(401).json({
                success: false,
                message: "Authentication required.",
            });

            return;
        }

        const listingId = getListingId(
            request,
            response,
        );

        if (!listingId) {
            return;
        }

        const favorited = await isFavorite(
            userId,
            listingId,
        );

        response.status(200).json({
            success: true,
            data: {
                listingId,
                favorited,
            },
        });
    } catch (error) {
        console.error(
            "[marketplace.favorites.status]",
            error,
        );

        response.status(500).json({
            success: false,
            message: "Unable to check favorite status.",
        });
    }
}

export async function getFavorites(
    request: Request,
    response: Response,
): Promise<void> {
    try {
        const userId = getAuthenticatedUserId(request);

        if (!userId) {
            response.status(401).json({
                success: false,
                message: "Authentication required.",
            });

            return;
        }

        const page = parsePositiveInteger(
            request.query.page,
            1,
            Number.MAX_SAFE_INTEGER,
        );

        const limit = parsePositiveInteger(
            request.query.limit,
            20,
            50,
        );

        const result = await listFavorites(
            userId,
            page,
            limit,
        );

        response.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error(
            "[marketplace.favorites.list]",
            error,
        );

        response.status(500).json({
            success: false,
            message: "Unable to retrieve favorites.",
        });
    }
}