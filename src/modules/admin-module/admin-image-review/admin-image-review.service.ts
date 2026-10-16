import {
    and,
    asc,
    count,
    desc,
    eq,
    type SQL,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
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

    const rows = await db
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
        .limit(1);

    const image = rows[0];

    if (!image) {
        throw new AppError(
            "Image not found.",
            404,
            "IMAGE_NOT_FOUND",
        );
    }

    const reason =
        input.reason?.trim() || null;

    const notes =
        input.notes?.trim() || null;

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

    const insertedRows = await db
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

    const insertedDecision =
        insertedRows[0];

    if (!insertedDecision) {
        throw new AppError(
            "Failed to record the image-review decision.",
            500,
            "IMAGE_REVIEW_SAVE_FAILED",
        );
    }

    return insertedDecision;
}

export async function retryAdminImageAnalysis(
    imageId: string,
) {
    const rows = await db
        .select({
            imageId: listingImages.id,
            listingId: listingImages.listingId,
            imageCheckStatus:
                listingImages.imageCheckStatus,
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

    if (
        image.imageCheckStatus === "PASSED"
    ) {
        throw new AppError(
            "This image has already passed automated checks.",
            409,
            "IMAGE_ALREADY_PASSED",
        );
    }

    const job =
        await enqueueImageAnalysisJob({
            listingImageId: image.imageId,
        });

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