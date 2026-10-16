import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../../database/index.ts";
import {
    listings,
    listingImages,
} from "../../../database/schema/index.ts";

import {
    enqueueImageAnalysisJob,
} from "../image-analysis/image-analysis-job.service.ts";
import { getImageAnalysisStatus } from "../image-analysis/image-analysis-query.service.ts";

const analyzeImageParamsSchema = z.object({
    listingId: z.string().uuid(),
    imageId: z.string().uuid(),
});

export async function analyzeListingImage(
    request: Request,
    response: Response,
): Promise<void> {
    const parsedParams = analyzeImageParamsSchema.safeParse(request.params);

    if (!parsedParams.success) {
        response.status(400).json({
            success: false,
            error: {
                code: "INVALID_PARAMETERS",
                message: "Invalid listingId or imageId.",
            },
        });
        return;
    }

    const { listingId, imageId } = parsedParams.data;

    if (!request.user) {
        response.status(401).json({
            success: false,
            error: {
                code: "UNAUTHORIZED",
                message: "Authentication is required.",
            },
        });
        return;
    }

    const result = await db
        .select({
            listingId: listings.id,
            sellerId: listings.sellerId,
            imageId: listingImages.id,
            imageCheckStatus: listingImages.imageCheckStatus,
        })
        .from(listingImages)
        .innerJoin(
            listings,
            eq(listings.id, listingImages.listingId),
        )
        .where(
            and(
                eq(listings.id, listingId),
                eq(listingImages.id, imageId),
            ),
        )
        .limit(1);

    const listingImage = result[0];

    if (!listingImage) {
        response.status(404).json({
            success: false,
            error: {
                code: "LISTING_IMAGE_NOT_FOUND",
                message: "Listing image was not found.",
            },
        });
        return;
    }

    if (listingImage.sellerId !== request.user.id) {
        response.status(403).json({
            success: false,
            error: {
                code: "FORBIDDEN",
                message: "You do not have permission to analyze this image.",
            },
        });
        return;
    }

    const job = await enqueueImageAnalysisJob({
        listingImageId: listingImage.imageId,
    });

    response.status(202).json({
        success: true,
        data: {
            jobId: job.id,
            listingImageId: listingImage.imageId,
            status: job.status,
            message: "Image analysis has been queued.",
        },
    });
}

export async function getListingImageAnalysis(
    request: Request,
    response: Response,
): Promise<void> {
    const parsedParams =
        analyzeImageParamsSchema.safeParse(
            request.params,
        );

    if (!parsedParams.success) {
        response.status(400).json({
            success: false,
            error: {
                code: "INVALID_PARAMETERS",
                message:
                    "Invalid listingId or imageId.",
            },
        });

        return;
    }

    const {
        listingId,
        imageId,
    } = parsedParams.data;

    if (!request.user) {
        response.status(401).json({
            success: false,
            error: {
                code: "UNAUTHORIZED",
                message:
                    "Authentication is required.",
            },
        });

        return;
    }

    const result = await db
        .select({
            listingId: listings.id,
            sellerId: listings.sellerId,
            imageId: listingImages.id,
        })
        .from(listingImages)
        .innerJoin(
            listings,
            eq(
                listings.id,
                listingImages.listingId,
            ),
        )
        .where(
            and(
                eq(
                    listings.id,
                    listingId,
                ),
                eq(
                    listingImages.id,
                    imageId,
                ),
            ),
        )
        .limit(1);

    const listingImage = result[0];

    if (!listingImage) {
        response.status(404).json({
            success: false,
            error: {
                code: "LISTING_IMAGE_NOT_FOUND",
                message:
                    "Listing image was not found.",
            },
        });

        return;
    }

    if (
        listingImage.sellerId !==
        request.user.id
    ) {
        response.status(403).json({
            success: false,
            error: {
                code: "FORBIDDEN",
                message:
                    "You do not have permission to view this image analysis.",
            },
        });

        return;
    }

    const analysis =
        await getImageAnalysisStatus(
            listingImage.imageId,
        );

    response.status(200).json({
        success: true,
        data: {
            listingImageId:
                listingImage.imageId,
            ...analysis,
        },
    });
}