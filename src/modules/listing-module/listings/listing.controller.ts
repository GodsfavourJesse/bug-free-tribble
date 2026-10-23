import type {
    NextFunction,
    Request,
    Response,
} from "express";

import { ZodError } from "zod";

import {
    addListingImage,
    createListing,
    deleteListing,
    getListingById,
    getSellerListings,
    getSellerListingSummary,
    markListingAsSold,
    reactivateListing,
    restoreListing,
    retrySellerImageAnalysis,
    searchListings,
    submitListingForReview,
    updateListing,
} from "./listing.service.ts";

import {
    createListingSchema,
    listingImageSchema,
    updateListingSchema,
} from "./listing.validation.ts";

import {
    isSellerListingStatus,
    type SellerListingsOptions,
    type SellerListingStatus,
} from "./listing.types.ts";

import { createNotification } from "../../notification-module/notification.service.ts";

import { AppError } from "../../../errors/app-error.ts";

import { logger } from "../../../config/logger.ts";

function getRequiredParam(
    value: string | string[] | undefined,
): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();

    return trimmed.length > 0
        ? trimmed
        : null;
}

function removeUndefined<T extends Record<string, unknown>>(
    input: T,
): {
    [K in keyof T]?: Exclude<T[K], undefined>;
} {
    return Object.fromEntries(
        Object.entries(input).filter(
            ([, value]) => value !== undefined,
        ),
    ) as {
        [K in keyof T]?: Exclude<T[K], undefined>;
    };
}

function sendError(
    response: Response,
    error: unknown,
    fallbackMessage: string,
): void {
    if (error instanceof ZodError) {
        response.status(400).json({
            success: false,
            message: "Invalid request data.",
            errors: error.issues,
        });

        return;
    }

    if (error instanceof AppError) {
        response.status(error.statusCode).json({
            success: false,
            message: error.message,
            code: error.code,
            ...(error.details !== undefined
                ? { details: error.details }
                : {}),
        });

        return;
    }

    logger.error(
        {
            err: error,
        },
        fallbackMessage,
    );

    response.status(500).json({
        success: false,
        message: fallbackMessage,
    });
}

export async function create(
    request: Request,
    response: Response,
): Promise<void> {
    if (!request.user) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });

        return;
    }

    try {
        const idempotencyKey =
            request.get("Idempotency-Key");

        if (!idempotencyKey) {
            response.status(400).json({
                success: false,
                message:
                    "The Idempotency-Key header is required.",
                code: "IDEMPOTENCY_KEY_REQUIRED",
            });

            return;
        }

        const input = createListingSchema.parse(
            request.body,
        );

        const result = await createListing(
            {
                sellerId: request.user.id,
                vehicleVariantId: input.vehicleVariantId,
                title: input.title,
                description: input.description,
                price: input.price,
                currency: input.currency,
                condition: input.condition,
                country: input.country,
                ...(input.mileage !== undefined
                    ? { mileage: input.mileage }
                    : {}),
                ...(input.state !== undefined
                    ? { state: input.state }
                    : {}),
                ...(input.city !== undefined
                    ? { city: input.city }
                    : {}),
            },
            idempotencyKey,
        );

        response.status(result.replayed ? 200 : 201).json({
            success: true,
            data: {
                listing: result.listing,
                replayed: result.replayed,
            },
        });
    } catch (error) {
        sendError(
            response,
            error,
            "Unable to create listing.",
        );
    }
}

export async function getById(
    request: Request,
    response: Response,
): Promise<void> {
    const listingId = getRequiredParam(
        request.params.id,
    );

    if (!listingId) {
        response.status(400).json({
            success: false,
            message: "Listing id is required.",
        });

        return;
    }

    try {
        const viewer = request.user
            ? {
                  userId: request.user.id,
              }
            : request.visitorId
              ? {
                    visitorId: request.visitorId,
                }
              : undefined;

        const listing = await getListingById(
            listingId,
            viewer,
        );

        if (!listing) {
            response.status(404).json({
                success: false,
                message: "Listing not found.",
            });

            return;
        }

        response.status(200).json({
            success: true,
            data: {
                listing,
            },
        });
    } catch (error) {
        sendError(
            response,
            error,
            "Unable to retrieve listing.",
        );
    }
}

export async function update(
    request: Request,
    response: Response,
): Promise<void> {
    if (!request.user) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });

        return;
    }

    const listingId = getRequiredParam(
        request.params.id,
    );

    if (!listingId) {
        response.status(400).json({
            success: false,
            message: "Listing id is required.",
        });

        return;
    }

    try {
        const input = updateListingSchema.parse(
            request.body,
        );

        const cleanInput = removeUndefined(input);

        const listing = await updateListing(
            listingId,
            request.user.id,
            cleanInput,
        );

        response.status(200).json({
            success: true,
            data: {
                listing,
            },
        });
    } catch (error) {
        sendError(
            response,
            error,
            "Unable to update listing.",
        );
    }
}

export async function remove(
    request: Request,
    response: Response,
): Promise<void> {
    if (!request.user) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });

        return;
    }

    const listingId = getRequiredParam(
        request.params.id,
    );

    if (!listingId) {
        response.status(400).json({
            success: false,
            message: "Listing id is required.",
        });

        return;
    }

    try {
        const listing = await deleteListing(
            listingId,
            request.user.id,
        );

        response.status(200).json({
            success: true,
            data: {
                listing,
            },
        });
    } catch (error) {
        sendError(
            response,
            error,
            "Unable to delete listing.",
        );
    }
}

export async function addImage(
    request: Request,
    response: Response,
): Promise<void> {
    if (!request.user) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });

        return;
    }

    const listingId = getRequiredParam(
        request.params.id,
    );

    if (!listingId) {
        response.status(400).json({
            success: false,
            message: "Listing id is required.",
        });

        return;
    }

    if (!request.file) {
        response.status(400).json({
            success: false,
            message: "Image file is required.",
        });

        return;
    }

    try {
        const input = listingImageSchema.parse(
            request.body,
        );

        const image = await addListingImage(
            listingId,
            request.user.id,
            {
                file: request.file,
                sortOrder: input.sortOrder,
            },
        );

        response.status(201).json({
            success: true,
            data: {
                image,
            },
        });
    } catch (error) {
        sendError(
            response,
            error,
            "Unable to add image.",
        );
    }
}

export async function search(
    request: Request,
    response: Response,
): Promise<void> {
    const query =
        typeof request.query.q === "string"
            ? request.query.q.trim()
            : undefined;

    try {
        const listings = await searchListings(
            query && query.length > 0
                ? query
                : undefined,
        );

        response.status(200).json({
            success: true,
            data: {
                listings,
            },
        });
    } catch (error) {
        sendError(
            response,
            error,
            "Unable to search listings.",
        );
    }
}

export async function submitForReview(
    request: Request,
    response: Response,
): Promise<void> {
    if (!request.user) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });

        return;
    }

    const listingId = getRequiredParam(
        request.params.id,
    );

    if (!listingId) {
        response.status(400).json({
            success: false,
            message: "Listing id is required.",
        });

        return;
    }

    try {
        const result = await submitListingForReview(
            listingId,
            request.user.id,
        );

        response.status(200).json({
            success: true,
            message: "Listing submitted for review.",
            data: {
                listing: result.listing,
            },
        });
    } catch (error) {
        sendError(
            response,
            error,
            "Failed to submit listing for review.",
        );
    }
}

export async function restore(
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

        const listingId = getRequiredParam(
            request.params.id,
        );

        if (!listingId) {
            response.status(400).json({
                success: false,
                message: "Listing id is required.",
            });

            return;
        }

        const result = await restoreListing(
            listingId,
            request.user.id,
        );

        response.status(200).json({
            success: true,
            message: "Listing restored successfully.",
            data: result,
        });
    } catch (error) {
        next(error);
    }
}

export async function markSold(
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

        const listingId = getRequiredParam(
            request.params.id,
        );

        if (!listingId) {
            response.status(400).json({
                success: false,
                message: "Listing id is required.",
            });

            return;
        }

        const result = await markListingAsSold(
            listingId,
            request.user.id,
        );

        /*
         * The listing transition has already committed.
         * Notification failure must not turn a successful
         * status change into a failed HTTP response.
         */
        try {
            await createNotification({
                userId: request.user.id,
                type: "LISTING_SOLD",
                title: "Listing marked as sold",
                message:
                    "Your listing has been marked as sold and is no longer available in the marketplace.",
                data: {
                    listingId,
                },
            });
        } catch (notificationError) {
            logger.error(
                {
                    err: notificationError,
                    listingId,
                    userId: request.user.id,
                },
                "Failed to notify seller after marking listing as sold.",
            );
        }

        response.status(200).json({
            success: true,
            message: "Listing marked as sold successfully.",
            data: result,
        });
    } catch (error) {
        next(error);
    }
}

export async function reactivate(
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

        const listingId = getRequiredParam(
            request.params.id,
        );

        if (!listingId) {
            response.status(400).json({
                success: false,
                message: "Listing id is required.",
            });

            return;
        }

        const result = await reactivateListing(
            listingId,
            request.user.id,
        );

        response.status(200).json({
            success: true,
            message:
                "Listing submitted for reactivation review successfully.",
            data: result,
        });
    } catch (error) {
        next(error);
    }
}

export async function dashboard(
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

        const statusValue = request.query.status;

        let status: SellerListingStatus | undefined;

        if (
            typeof statusValue === "string" &&
            isSellerListingStatus(statusValue)
        ) {
            status = statusValue;
        }

        const page =
            Number.isFinite(pageValue) && pageValue > 0
                ? Math.floor(pageValue)
                : 1;

        const limit =
            Number.isFinite(limitValue) &&
            limitValue > 0
                ? Math.min(Math.floor(limitValue), 100)
                : 20;

        const options: SellerListingsOptions = {
            sellerId: request.user.id,
            page,
            limit,
            ...(status !== undefined ? { status } : {}),
        };

        const [summary, listingsResult] = await Promise.all([
            getSellerListingSummary(request.user.id),
            getSellerListings(options),
        ]);

        response.status(200).json({
            success: true,
            data: {
                summary,
                ...listingsResult,
            },
        });
    } catch (error) {
        next(error);
    }
}

export async function retryImageAnalysis(
    request: Request,
    response: Response,
): Promise<void> {
    if (!request.user) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });

        return;
    }

    const listingId = getRequiredParam(
        request.params.id,
    );

    const imageId = getRequiredParam(
        request.params.imageId,
    );

    if (!listingId || !imageId) {
        response.status(400).json({
            success: false,
            message: "Listing ID and image ID are required.",
        });

        return;
    }

    try {
        const job = await retrySellerImageAnalysis(
            listingId,
            imageId,
            request.user.id,
        );

        response.status(202).json({
            success: true,
            message: "Image analysis has been queued.",
            data: {
                jobId: job.id,
                listingImageId: job.listingImageId,
                status: job.status,
            },
        });
    } catch (error) {
        sendError(
            response,
            error,
            "Unable to retry image analysis.",
        );
    }
}