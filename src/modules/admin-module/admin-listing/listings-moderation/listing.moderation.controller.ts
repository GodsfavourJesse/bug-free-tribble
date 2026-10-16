import type {
    NextFunction,
    Request,
    Response,
} from "express";

import {
    ZodError,
} from "zod";

import {
    approveListing,
    getModerationListing,
    getPendingListings,
    rejectListing,
    suspendListing,
} from "./listing.moderation.service.ts";

import {
    rejectListingSchema,
} from "./listing.moderation.validation.ts";

import {
    suspendListingSchema,
} from "./listing.suspension.validation.ts";

import {
    createNotification,
} from "../../../notification-module/notification.service.ts";

function getErrorMessage(
    error: unknown,
    fallback: string,
): string {
    return error instanceof Error
        ? error.message
        : fallback;
}

/**
 * GET /pending
 *
 * Retrieve listings awaiting administrator review.
 */
export async function pending(
    _request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const listings =
            await getPendingListings();

        response.status(200).json({
            success: true,
            data: {
                listings,
            },
        });
    } catch (error) {
        next(error);
    }
}

/**
 * GET /:id
 *
 * Retrieve a listing and its moderation details.
 */
export async function getById(
    request: Request<{ id: string }>,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const listing =
            await getModerationListing(
                request.params.id,
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
        next(error);
    }
}

/**
 * POST /:id/approve
 *
 * Approve a listing.
 *
 * The listing service remains responsible for checking
 * automated image-review results before approval.
 */
export async function approve(
    request: Request<{ id: string }>,
    response: Response,
    next: NextFunction,
): Promise<void> {
    const admin = request.admin;

    if (!admin) {
        response.status(401).json({
            success: false,
            message:
                "Administrator authentication required.",
        });

        return;
    }

    try {
        const result =
            await approveListing(
                request.params.id,
                admin.id,
            );

        response.status(200).json({
            success: true,
            message:
                "Listing approved successfully.",
            data: {
                listing: result.listing,
            },
        });
    } catch (error) {
        next(error);
    }
}

/**
 * POST /:id/reject
 *
 * Reject a listing.
 *
 * A rejection reason is required.
 */
export async function reject(
    request: Request<{ id: string }>,
    response: Response,
    next: NextFunction,
): Promise<void> {
    const admin = request.admin;

    if (!admin) {
        response.status(401).json({
            success: false,
            message:
                "Administrator authentication required.",
        });

        return;
    }

    try {
        const input =
            rejectListingSchema.parse(
                request.body,
            );

        const result =
            await rejectListing(
                request.params.id,
                admin.id,
                input.reason,
            );

        response.status(200).json({
            success: true,
            message:
                "Listing rejected successfully.",
            data: {
                listing: result.listing,
            },
        });
    } catch (error) {
        if (error instanceof ZodError) {
            response.status(400).json({
                success: false,
                message:
                    "A valid rejection reason is required.",
                errors: error.issues,
            });

            return;
        }

        next(error);
    }
}

/**
 * POST /:id/suspend
 *
 * Suspend an approved listing.
 *
 * The seller is notified after the suspension succeeds.
 */
export async function suspend(
    request: Request<{ id: string }>,
    response: Response,
    next: NextFunction,
): Promise<void> {
    const admin = request.admin;

    if (!admin) {
        response.status(401).json({
            success: false,
            message:
                "Administrator authentication required.",
        });

        return;
    }

    try {
        const parsed =
            suspendListingSchema.safeParse(
                request.body,
            );

        if (!parsed.success) {
            response.status(400).json({
                success: false,
                message:
                    "Invalid suspension request.",
                errors:
                    parsed.error.flatten(),
            });

            return;
        }

        const result =
            await suspendListing(
                request.params.id,
                admin.id,
                parsed.data.reason,
            );

        /*
         * The suspension has already succeeded.
         * A notification failure must not make the
         * API report that the suspension itself failed.
         */
        try {
            await createNotification({
                userId:
                    result.listing.sellerId,
                type: "GENERAL",
                title: "Listing suspended",
                message:
                    "Your KARMASS listing has been suspended and is no longer visible in the marketplace.",
                data: {
                    listingId:
                        request.params.id,
                    reason:
                        parsed.data.reason,
                },
            });
        } catch (notificationError) {
            /*
             * Log the notification failure through the
             * application's central error middleware.
             *
             * Do not call next() here because the
             * suspension has already succeeded.
             */
            console.error(
                "Listing suspension succeeded, but the seller notification failed.",
                {
                    listingId:
                        request.params.id,
                    sellerId:
                        result.listing.sellerId,
                    error: getErrorMessage(
                        notificationError,
                        "Unknown notification error.",
                    ),
                },
            );
        }

        response.status(200).json({
            success: true,
            message:
                "Listing suspended successfully.",
            data: result,
        });
    } catch (error) {
        next(error);
    }
}