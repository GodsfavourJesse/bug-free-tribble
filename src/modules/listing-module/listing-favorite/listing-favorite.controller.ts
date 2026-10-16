import type {
    NextFunction,
    Request,
    Response,
} from "express";

import {
    addListingFavorite,
    getUserFavorites,
    isListingFavorited,
    removeListingFavorite,
} from "./listing-favorite.service.ts";

export async function addFavorite(
    request: Request<{ id: string }>,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        if (!request.user) {
            response.status(401).json({
                success: false,
                message: "Authentication required.",
            });
            return;
        }

        const listingId = request.params.id?.trim();

        if (!listingId) {
            response.status(400).json({
                success: false,
                message: "Listing id is required.",
            });
            return;
        }

        const result = await addListingFavorite(
            listingId,
            request.user.id,
        );

        response
            .status(
                result.alreadyExists
                    ? 200
                    : 201,
            )
            .json({
                success: true,
                message: result.alreadyExists
                    ? "Listing is already in your favorites."
                    : "Listing added to favorites.",
                data: {
                    favorited: result.favorited,
                },
            });
    } catch (error) {
        next(error);
    }
}

export async function removeFavorite(
    request: Request<{ id: string }>,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        if (!request.user) {
            response.status(401).json({
                success: false,
                message: "Authentication required.",
            });
            return;
        }

        const listingId = request.params.id?.trim();

        if (!listingId) {
            response.status(400).json({
                success: false,
                message: "Listing id is required.",
            });
            return;
        }

        await removeListingFavorite(
            listingId,
            request.user.id,
        );

        response.status(200).json({
            success: true,
            message:
                "Listing removed from favorites.",
            data: {
                favorited: false,
            },
        });
    } catch (error) {
        next(error);
    }
}

export async function getFavoriteStatus(
    request: Request<{ id: string }>,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        if (!request.user) {
            response.status(401).json({
                success: false,
                message: "Authentication required.",
            });
            return;
        }

        const listingId = request.params.id?.trim();

        if (!listingId) {
            response.status(400).json({
                success: false,
                message: "Listing id is required.",
            });
            return;
        }

        const favorited =
            await isListingFavorited(
                listingId,
                request.user.id,
            );

        response.status(200).json({
            success: true,
            data: {
                listingId,
                favorited,
            },
        });
    } catch (error) {
        next(error);
    }
}

export async function getFavorites(
    request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        if (!request.user) {
            response.status(401).json({
                success: false,
                message: "Authentication required.",
            });
            return;
        }

        const pageValue = Number(
            request.query.page ?? 1,
        );

        const limitValue = Number(
            request.query.limit ?? 20,
        );

        const page =
            Number.isFinite(pageValue) &&
            pageValue > 0
                ? Math.floor(pageValue)
                : 1;

        const limit =
            Number.isFinite(limitValue) &&
            limitValue > 0
                ? Math.min(
                      Math.floor(limitValue),
                      100,
                  )
                : 20;

        const result =
            await getUserFavorites({
                userId: request.user.id,
                page,
                limit,
            });

        response.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        next(error);
    }
}