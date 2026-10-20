import {
    asc,
    eq,
} from "drizzle-orm";

import {
    db,
} from "../../../../database/index.ts";

import {
    listingHistory,
    listingImages,
    listings,
    vehicleGenerations,
    vehicleMakes,
    vehicleModels,
    vehicleVariants,
    users,
} from "../../../../database/schema/index.ts";

import {
    transitionListing,
} from "../../../listing-module/listings/listing.lifecycle.ts";

import {
    createNotification,
} from "../../../notification-module/notification.service.ts";

import {
    AppError,
} from "../../../../errors/app-error.ts";

import {
    logger,
} from "../../../../config/logger.ts";

/**
 * Retrieve all listings awaiting administrator review.
 *
 * Includes vehicle information and uploaded images.
 */
export async function getPendingListings() {
    const results = await db
        .select({
            listing: listings,
            vehicleVariant: vehicleVariants,
            vehicleGeneration: vehicleGenerations,
            vehicleModel: vehicleModels,
            vehicleMake: vehicleMakes,
            seller: {
                id: users.id,
                email: users.email,
                firstName: users.firstName,
                lastName: users.lastName,
                accountType: users.accountType,
                status: users.status,
            },
        })
        .from(listings)
        .innerJoin(
            users,
            eq(
                listings.sellerId,
                users.id,
            ),
        )
        .innerJoin(
            vehicleVariants,
            eq(
                listings.vehicleVariantId,
                vehicleVariants.id,
            ),
        )
        .innerJoin(
            vehicleGenerations,
            eq(
                vehicleVariants.generationId,
                vehicleGenerations.id,
            ),
        )
        .innerJoin(
            vehicleModels,
            eq(
                vehicleGenerations.modelId,
                vehicleModels.id,
            ),
        )
        .innerJoin(
            vehicleMakes,
            eq(
                vehicleModels.makeId,
                vehicleMakes.id,
            ),
        )
        .where(
            eq(
                listings.status,
                "PENDING_REVIEW",
            ),
        )
        .orderBy(
            asc(listings.createdAt),
        );

    return Promise.all(
        results.map(async (result) => {
            const images = await db
                .select()
                .from(listingImages)
                .where(
                    eq(
                        listingImages.listingId,
                        result.listing.id,
                    ),
                )
                .orderBy(
                    asc(
                        listingImages.sortOrder,
                    ),
                );

            return {
                ...result,
                images,
            };
        }),
    );
}

/**
 * Retrieve one listing with its vehicle details,
 * images, and moderation history.
 */
export async function getModerationListing(
    listingId: string,
) {
    const results = await db
        .select({
            listing: listings,
            vehicleVariant: vehicleVariants,
            vehicleGeneration: vehicleGenerations,
            vehicleModel: vehicleModels,
            vehicleMake: vehicleMakes,
            seller: {
                id: users.id,
                email: users.email,
                firstName: users.firstName,
                lastName: users.lastName,
                accountType: users.accountType,
                status: users.status,
            },
        })
        .from(listings)
        .innerJoin(
            users,
            eq(
                listings.sellerId,
                users.id,
            ),
        )
        .innerJoin(
            vehicleVariants,
            eq(
                listings.vehicleVariantId,
                vehicleVariants.id,
            ),
        )
        .innerJoin(
            vehicleGenerations,
            eq(
                vehicleVariants.generationId,
                vehicleGenerations.id,
            ),
        )
        .innerJoin(
            vehicleModels,
            eq(
                vehicleGenerations.modelId,
                vehicleModels.id,
            ),
        )
        .innerJoin(
            vehicleMakes,
            eq(
                vehicleModels.makeId,
                vehicleMakes.id,
            ),
        )
        .where(
            eq(
                listings.id,
                listingId,
            ),
        )
        .limit(1);

    const listing = results[0];

    if (!listing) {
        return null;
    }

    const [
        images,
        history,
    ] = await Promise.all([
        db
            .select()
            .from(listingImages)
            .where(
                eq(
                    listingImages.listingId,
                    listing.listing.id,
                ),
            )
            .orderBy(
                asc(
                    listingImages.sortOrder,
                ),
            ),

        db
            .select()
            .from(listingHistory)
            .where(
                eq(
                    listingHistory.listingId,
                    listing.listing.id,
                ),
            )
            .orderBy(
                asc(
                    listingHistory.createdAt,
                ),
            ),
    ]);

    return {
        ...listing,
        images,
        history,
    };
}

/**
 * Approve a listing after validating all image checks.
 *
 * An administrator cannot approve a listing when:
 * - It has no images.
 * - Any image check is pending.
 * - Any image check failed.
 * - Any image requires additional review.
 */
export async function approveListing(
    listingId: string,
    adminId: string,
) {
    const images = await db
        .select({
            id: listingImages.id,
            imageCheckStatus:
                listingImages.imageCheckStatus,
            checkReason:
                listingImages.checkReason,
        })
        .from(listingImages)
        .where(
            eq(
                listingImages.listingId,
                listingId,
            ),
        );

    if (images.length === 0) {
        throw new AppError(
            "Listing cannot be approved without images.",
            409,
            "LISTING_IMAGES_REQUIRED",
        );
    }

    const pendingImages = images.some(
        (image) =>
            image.imageCheckStatus === "PENDING",
    );

    if (pendingImages) {
        throw new AppError(
            "Listing cannot be approved while image checks are still pending.",
            409,
            "LISTING_IMAGE_CHECK_PENDING",
        );
    }

    const failedImages = images.some(
        (image) =>
            image.imageCheckStatus === "FAILED",
    );

    if (failedImages) {
        throw new AppError(
            "Listing cannot be approved because one or more images failed the image check.",
            409,
            "LISTING_IMAGE_CHECK_FAILED",
        );
    }

    const reviewImages = images.some(
        (image) =>
            image.imageCheckStatus === "REVIEW",
    );

    if (reviewImages) {
        throw new AppError(
            "Listing cannot be approved because one or more images require additional review.",
            409,
            "LISTING_IMAGE_REQUIRES_REVIEW",
        );
    }

    /*
     * Temporary configuration:
     * Listing visibility currently lasts 30 days.
     *
     * We will replace this with the configured
     * platform setting in a later step.
     */
    const listingDurationDays = 30;

    const expiresAt = new Date();

    expiresAt.setDate(
        expiresAt.getDate() + listingDurationDays,
    );

    const result = await transitionListing({
        listingId,
        action: "APPROVE",
        actorId: adminId,
        expiresAt,
    });

    /*
     * A notification failure must not undo a
     * successful listing approval.
     */
    try {
        await createNotification({
            userId: result.listing.sellerId,
            type: "LISTING_APPROVED",
            title: "Listing approved",
            message:
                "Your KARMASS listing has been approved and is now visible in the marketplace.",
            data: {
                listingId,
            },
        });
    } catch (error) {
        logger.error(
            {
                err: error,
                listingId,
                sellerId: result.listing.sellerId,
                adminId,
            },
            "Listing approval succeeded, but its notification could not be created.",
        );
    }

    return result;
}

/**
 * Reject a listing and notify its seller.
 */
export async function rejectListing(
    listingId: string,
    adminId: string,
    rejectionReason: string,
) {
    const reason = rejectionReason.trim();

    if (!reason) {
        throw new AppError(
            "A rejection reason is required.",
            400,
            "LISTING_REJECTION_REASON_REQUIRED",
        );
    }

    const result = await transitionListing({
        listingId,
        action: "REJECT",
        actorId: adminId,
        rejectionReason: reason,
        reason,
    });

    /*
     * The rejection has already happened.
     * Log notification failures instead of reporting
     * the entire operation as though rejection failed.
     */
    try {
        await createNotification({
            userId: result.listing.sellerId,
            type: "LISTING_REJECTED",
            title: "Listing rejected",
            message:
                `Your KARMASS listing was rejected. Reason: ${reason}`,
            data: {
                listingId,
                reason,
            },
        });
    } catch (error) {
        logger.error(
            {
                err: error,
                listingId,
                sellerId: result.listing.sellerId,
                adminId,
            },
            "Listing rejection succeeded, but its notification could not be created.",
        );
    }

    return result;
}

/**
 * Suspend an approved listing.
 *
 * Only approved listings can be suspended.
 * The lifecycle service records the transition.
 */
export async function suspendListing(
    listingId: string,
    adminId: string,
    reason: string,
) {
    const trimmedReason = reason.trim();

    if (!trimmedReason) {
        throw new AppError(
            "A suspension reason is required.",
            400,
            "LISTING_SUSPENSION_REASON_REQUIRED",
        );
    }

    const results = await db
        .select({
            id: listings.id,
            status: listings.status,
        })
        .from(listings)
        .where(
            eq(
                listings.id,
                listingId,
            ),
        )
        .limit(1);

    const listing = results[0];

    if (!listing) {
        throw new AppError(
            "Listing not found.",
            404,
            "LISTING_NOT_FOUND",
        );
    }

    if (listing.status !== "APPROVED") {
        throw new AppError(
            "Only approved listings can be suspended.",
            409,
            "LISTING_NOT_APPROVED",
        );
    }

    return transitionListing({
        listingId,
        action: "SUSPEND",
        actorId: adminId,
        reason: trimmedReason,
    });
}