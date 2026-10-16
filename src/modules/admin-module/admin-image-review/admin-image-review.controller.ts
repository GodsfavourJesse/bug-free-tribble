import type {
    Request,
    Response,
} from "express";

import {
    adminImageReviewDecisionSchema,
    adminImageReviewListQuerySchema,
    adminImageReviewParamsSchema,
} from "./admin-image-review.validation.ts";

import {
    getAdminImageReview,
    listAdminImageReviews,
    recordAdminImageReviewDecision,
    retryAdminImageAnalysis,
} from "./admin-image-review.service.ts";

function sendValidationError(
    response: Response,
    message: string,
): void {
    response.status(400).json({
        success: false,
        message,
    });
}

export async function listAdminImageReviewsController(
    request: Request,
    response: Response,
): Promise<void> {
    const parsed =
        adminImageReviewListQuerySchema.safeParse(
            request.query,
        );

    if (!parsed.success) {
        sendValidationError(
            response,
            "Invalid image-review query parameters.",
        );
        return;
    }

    const result =
        await listAdminImageReviews(
            parsed.data,
        );

    response.status(200).json({
        success: true,
        data: result,
    });
}

export async function getAdminImageReviewController(
    request: Request,
    response: Response,
): Promise<void> {
    const parsed =
        adminImageReviewParamsSchema.safeParse({
            imageId: request.params.imageId,
        });

    if (!parsed.success) {
        sendValidationError(
            response,
            "A valid image ID is required.",
        );
        return;
    }

    const result =
        await getAdminImageReview(
            parsed.data.imageId,
        );

    response.status(200).json({
        success: true,
        data: result,
    });
}

export async function recordAdminImageReviewDecisionController(
    request: Request,
    response: Response,
): Promise<void> {
    const params =
        adminImageReviewParamsSchema.safeParse({
            imageId: request.params.imageId,
        });

    if (!params.success) {
        sendValidationError(
            response,
            "A valid image ID is required.",
        );
        return;
    }

    const body =
        adminImageReviewDecisionSchema.safeParse(
            request.body,
        );

    if (!body.success) {
        sendValidationError(
            response,
            "Invalid image-review decision. Rejections require a reason.",
        );
        return;
    }

    const admin = request.admin;

    if (!admin?.id) {
        response.status(401).json({
            success: false,
            message:
                "Administrator authentication required.",
        });
        return;
    }

    const result =
        await recordAdminImageReviewDecision(
            params.data.imageId,
            admin.id,
            body.data,
        );

    response.status(201).json({
        success: true,
        message:
            "Image-review decision recorded successfully.",
        data: result,
    });
}

export async function retryAdminImageAnalysisController(
    request: Request,
    response: Response,
): Promise<void> {
    const parsed =
        adminImageReviewParamsSchema.safeParse({
            imageId: request.params.imageId,
        });

    if (!parsed.success) {
        sendValidationError(
            response,
            "A valid image ID is required.",
        );
        return;
    }

    const result =
        await retryAdminImageAnalysis(
            parsed.data.imageId,
        );

    response.status(202).json({
        success: true,
        message: result.message,
        data: result,
    });
}