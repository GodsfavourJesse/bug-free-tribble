import {
    and,
    asc,
    count,
    desc,
    eq,
    or,
    type SQL,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    imageAnalysisJobs,
    imageAnalysisRuns,
    imageReviewDecisions,
    listingImages,
    listings,
} from "../../../database/schema/index.ts";

import {
    AppError,
} from "../../../errors/app-error.ts";

import {
    getImageAnalysisStatus,
} from "../../image-module/image-analysis/image-analysis-query.service.ts";

import {
    enqueueImageAnalysisJob,
} from "../../image-module/image-analysis/image-analysis-job.service.ts";

import type {
    AdminImageReviewDecisionInput,
    AdminImageReviewListQuery,
} from "./admin-image-review.validation.ts";
import { ImageAnalysisJob } from "../../../jobs/jobs.types.ts";

const IMAGE_REVIEW_PAGE_SIZE_DEFAULT = 20;

function getImageStatusFilter(
    status: AdminImageReviewListQuery["status"],
): SQL | undefined {
    if (status === "ALL") {
        return undefined;
    }

    return eq(
        listingImages.imageCheckStatus,
        status,
    );
}

export async function listAdminImageReviews(
    query: AdminImageReviewListQuery,
) {
    const page = query.page;
    const limit =
        query.limit ??
        IMAGE_REVIEW_PAGE_SIZE_DEFAULT;

    const offset = (page - 1) * limit;

    const conditions: SQL[] = [];

    const statusCondition =
        getImageStatusFilter(query.status);

    if (statusCondition) {
        conditions.push(statusCondition);
    }

    const whereClause =
        conditions.length > 0
            ? and(...conditions)
            : undefined;

    const ordering =
        query.sort === "newest"
            ? desc(listingImages.createdAt)
            : asc(listingImages.createdAt);

    const [rows, countRows] =
        await Promise.all([
            db
                .select({
                    imageId: listingImages.id,
                    listingId: listingImages.listingId,
                    objectKey: listingImages.objectKey,
                    originalName: listingImages.originalName,
                    mimeType: listingImages.mimeType,
                    width: listingImages.width,
                    height: listingImages.height,
                    sortOrder: listingImages.sortOrder,
                    imageCheckStatus:
                        listingImages.imageCheckStatus,
                    similarityScore:
                        listingImages.similarityScore,
                    matchedImageId:
                        listingImages.matchedImageId,
                    matchedListingId:
                        listingImages.matchedListingId,
                    checkReason:
                        listingImages.checkReason,
                    imageCreatedAt:
                        listingImages.createdAt,
                    listingStatus: listings.status,
                    sellerId: listings.sellerId,
                })
                .from(listingImages)
                .innerJoin(
                    listings,
                    eq(
                        listingImages.listingId,
                        listings.id,
                    ),
                )
                .where(whereClause)
                .orderBy(ordering)
                .limit(limit)
                .offset(offset),

            db
                .select({
                    total: count(),
                })
                .from(listingImages)
                .innerJoin(
                    listings,
                    eq(
                        listingImages.listingId,
                        listings.id,
                    ),
                )
                .where(whereClause),
        ]);

    const total = Number(
        countRows[0]?.total ?? 0,
    );

    return {
        items: rows,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(
                total / limit,
            ),
        },
    };
}

export async function getAdminImageReview(
    imageId: string,
) {
    const rows = await db
        .select({
            imageId: listingImages.id,
            listingId: listingImages.listingId,
            objectKey: listingImages.objectKey,
            originalName: listingImages.originalName,
            mimeType: listingImages.mimeType,
            width: listingImages.width,
            height: listingImages.height,
            sortOrder: listingImages.sortOrder,
            sha256: listingImages.sha256,
            perceptualHash:
                listingImages.perceptualHash,
            imageCheckStatus:
                listingImages.imageCheckStatus,
            similarityScore:
                listingImages.similarityScore,
            matchedImageId:
                listingImages.matchedImageId,
            matchedListingId:
                listingImages.matchedListingId,
            checkReason:
                listingImages.checkReason,
            imageCreatedAt:
                listingImages.createdAt,
            listingStatus: listings.status,
            sellerId: listings.sellerId,
        })
        .from(listingImages)
        .innerJoin(
            listings,
            eq(
                listingImages.listingId,
                listings.id,
            ),
        )
        .where(
            eq(
                listingImages.id,
                imageId,
            ),
        )
        .limit(1);

    const image = rows[0];

    if (!image) {
        throw new AppError(
            "Image not found.",
            404,
            "IMAGE_NOT_FOUND",
        );
    }

    const [analysis, decisions] =
        await Promise.all([
            getImageAnalysisStatus(imageId),

            db
                .select({
                    id: imageReviewDecisions.id,
                    listingImageId:
                        imageReviewDecisions.listingImageId,
                    listingId:
                        imageReviewDecisions.listingId,
                    reviewerId:
                        imageReviewDecisions.reviewerId,
                    decision:
                        imageReviewDecisions.decision,
                    reason:
                        imageReviewDecisions.reason,
                    notes:
                        imageReviewDecisions.notes,
                    createdAt:
                        imageReviewDecisions.createdAt,
                })
                .from(imageReviewDecisions)
                .where(
                    eq(
                        imageReviewDecisions.listingImageId,
                        imageId,
                    ),
                )
                .orderBy(
                    desc(
                        imageReviewDecisions.createdAt,
                    ),
                ),
        ]);

    return {
        image,
        analysis,
        reviewHistory: decisions,
    };
}

export async function recordAdminImageReviewDecision(
    imageId: string,
    reviewerId: string,
    input: AdminImageReviewDecisionInput,
) {
    if (!reviewerId.trim()) {
        throw new AppError(
            "Authenticated administrator identity is required.",
            401,
            "ADMIN_IDENTITY_REQUIRED",
        );
    }

    const reason = input.reason?.trim() || null;
    const notes = input.notes?.trim() || null;

    if (
        input.decision === "REJECTED" &&
        !reason
    ) {
        throw new AppError(
            "A reason is required when rejecting an image.",
            400,
            "IMAGE_REJECTION_REASON_REQUIRED",
        );
    }

    const now = new Date();

    const imageStatus =
        input.decision === "APPROVED"
            ? "PASSED"
            : input.decision === "REJECTED"
                ? "FAILED"
                : "REVIEW";

    return db.transaction(async (tx) => {
        /*
         * 1. Lock the image row first.
         *
         * This serializes administrator decisions and analysis
         * completion, provided both services use this same
         * lock order.
         */
        const images = await tx
            .select({
                imageId: listingImages.id,
                listingId: listingImages.listingId,
            })
            .from(listingImages)
            .where(
                eq(
                    listingImages.id,
                    imageId,
                ),
            )
            .limit(1)
            .for("update");

        const image = images[0];

        if (!image) {
            throw new AppError(
                "Image not found.",
                404,
                "IMAGE_NOT_FOUND",
            );
        }

        /*
         * 2. Lock active jobs for this image.
         */
        const activeJobs = await tx
            .select({
                id: imageAnalysisJobs.id,
                analysisRunId:
                    imageAnalysisJobs.analysisRunId,
            })
            .from(imageAnalysisJobs)
            .where(
                and(
                    eq(
                        imageAnalysisJobs.listingImageId,
                        image.imageId,
                    ),
                    or(
                        eq(
                            imageAnalysisJobs.status,
                            "QUEUED",
                        ),
                        eq(
                            imageAnalysisJobs.status,
                            "PROCESSING",
                        ),
                    ),
                ),
            )
            .orderBy(
                asc(imageAnalysisJobs.createdAt),
            )
            .for("update");

        /*
         * 3. Cancel active jobs.
         */
        for (const job of activeJobs) {
            await tx
                .update(imageAnalysisJobs)
                .set({
                    status: "CANCELLED",
                    lockedAt: null,
                    lockedBy: null,
                    updatedAt: now,
                })
                .where(
                    and(
                        eq(
                            imageAnalysisJobs.id,
                            job.id,
                        ),
                        or(
                            eq(
                                imageAnalysisJobs.status,
                                "QUEUED",
                            ),
                            eq(
                                imageAnalysisJobs.status,
                                "PROCESSING",
                            ),
                        ),
                    ),
                );

            if (job.analysisRunId) {
                await tx
                    .update(imageAnalysisRuns)
                    .set({
                        status: "CANCELLED",
                        completedAt: now,
                    })
                    .where(
                        and(
                            eq(
                                imageAnalysisRuns.id,
                                job.analysisRunId,
                            ),
                            eq(
                                imageAnalysisRuns.status,
                                "RUNNING",
                            ),
                        ),
                    );
            }
        }

        /*
         * 4. Save the review decision.
         */
        const decisions = await tx
            .insert(imageReviewDecisions)
            .values({
                listingImageId: image.imageId,
                listingId: image.listingId,
                reviewerId,
                decision: input.decision,
                reason,
                notes,
            })
            .returning({
                id: imageReviewDecisions.id,
                listingImageId:
                    imageReviewDecisions.listingImageId,
                listingId:
                    imageReviewDecisions.listingId,
                reviewerId:
                    imageReviewDecisions.reviewerId,
                decision:
                    imageReviewDecisions.decision,
                reason:
                    imageReviewDecisions.reason,
                notes:
                    imageReviewDecisions.notes,
                createdAt:
                    imageReviewDecisions.createdAt,
            });

        const decision = decisions[0];

        if (!decision) {
            throw new AppError(
                "Failed to record the image-review decision.",
                500,
                "IMAGE_REVIEW_SAVE_FAILED",
            );
        }

        /*
         * 5. Update the authoritative image status.
         */
        const updatedImages = await tx
            .update(listingImages)
            .set({
                imageCheckStatus: imageStatus,
                imageCheckSource: "ADMIN",
                checkReason: reason,
                checkedAt: now,
            })
            .where(
                eq(
                    listingImages.id,
                    image.imageId,
                ),
            )
            .returning({
                id: listingImages.id,
                imageCheckStatus: listingImages.imageCheckStatus,
                checkReason: listingImages.checkReason,
                checkedAt: listingImages.checkedAt,
            });

        const updatedImage = updatedImages[0];

        if (!updatedImage) {
            throw new AppError(
                "Failed to update the image review status.",
                500,
                "IMAGE_REVIEW_STATUS_UPDATE_FAILED",
            );
        }

        return {
            decision,
            image: updatedImage,
        };
    });
}

export async function retryAdminImageAnalysis(
    imageId: string,
) {
    // ---------------------------------------------------------
    // 1. Find the image and its current status
    // ---------------------------------------------------------

    const rows = await db
        .select({
            imageId: listingImages.id,
            listingId: listingImages.listingId,
            imageCheckStatus:
                listingImages.imageCheckStatus,
            checkedAt: listingImages.checkedAt,
        })
        .from(listingImages)
        .where(
            eq(
                listingImages.id,
                imageId,
            ),
        )
        .limit(1);

    const image = rows[0];

    if (!image) {
        throw new AppError(
            "Image not found.",
            404,
            "IMAGE_NOT_FOUND",
        );
    }

    // ---------------------------------------------------------
    // 2. Never retry an image that has already passed
    // ---------------------------------------------------------

    if (
        image.imageCheckStatus === "PASSED"
    ) {
        throw new AppError(
            "This image has already passed automated checks.",
            409,
            "IMAGE_ALREADY_PASSED",
        );
    }

    // ---------------------------------------------------------
    // 3. Find the most recent administrative decision
    // ---------------------------------------------------------

    const decisionRows = await db
        .select({
            decision: imageReviewDecisions.decision,
            reason: imageReviewDecisions.reason,
            createdAt: imageReviewDecisions.createdAt,
        })
        .from(imageReviewDecisions)
        .where(
            eq(
                imageReviewDecisions.listingImageId,
                image.imageId,
            ),
        )
        .orderBy(
            desc(
                imageReviewDecisions.createdAt,
            ),
        )
        .limit(1);

    const latestDecision = decisionRows[0];

    // ---------------------------------------------------------
    // 4. Determine whether the current failure came from
    //    an administrator's rejection
    // ---------------------------------------------------------

    const currentFailureIsAdminRejection =
        image.imageCheckStatus === "FAILED" &&
        latestDecision?.decision === "REJECTED" &&
        image.checkedAt !== null &&
        latestDecision.createdAt >= image.checkedAt;

    if (currentFailureIsAdminRejection) {
        throw new AppError(
            "This image was rejected by an administrator and cannot be retried through automated analysis.",
            409,
            "IMAGE_ADMIN_REJECTED",
        );
    }

    // ---------------------------------------------------------
    // 5. Queue or reuse the eligible analysis job
    // ---------------------------------------------------------

    let job: ImageAnalysisJob;

    try {
        job = await enqueueImageAnalysisJob({
            listingImageId: image.imageId,
            retryTechnicalFailure: true,
        });
    } catch (error: unknown) {
        const message =
            error instanceof Error
                ? error.message
                : "Unable to retry image analysis.";

        if (
            message.includes(
                "rejected by an administrator",
            )
        ) {
            throw new AppError(
                "This image was rejected by an administrator and cannot be retried through automated analysis.",
                409,
                "IMAGE_ADMIN_REJECTED",
            );
        }

        if (
            message.includes(
                "Only technically failed images",
            )
        ) {
            throw new AppError(
                "Only images that failed technical analysis can be retried.",
                409,
                "IMAGE_NOT_ELIGIBLE_FOR_RETRY",
            );
        }

        if (
            message.includes(
                "already passed review",
            )
        ) {
            throw new AppError(
                "This image has already passed review.",
                409,
                "IMAGE_ALREADY_PASSED",
            );
        }

        if (
            message.includes(
                "not awaiting analysis",
            )
        ) {
            throw new AppError(
                "This image is not awaiting analysis.",
                409,
                "IMAGE_NOT_AWAITING_ANALYSIS",
            );
        }

        throw error;
    }

    return {
        listingImageId: image.imageId,
        listingId: image.listingId,
        jobId: job.id,
        status: job.status,
        message:
            job.status === "QUEUED"
                ? "Image analysis is queued."
                : "An image-analysis job is already active.",
    };
}