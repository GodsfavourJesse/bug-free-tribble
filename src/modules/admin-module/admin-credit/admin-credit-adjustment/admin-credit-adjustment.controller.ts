import type {
    NextFunction,
    Request,
    Response,
} from "express";

import { z } from "zod";

import { AppError } from "../../../../errors/app-error.ts";

import {
    adjustUserListingCredits,
} from "./admin-credit-adjustment.service.ts";

const adjustmentSchema = z.object({
    amount: z
        .number()
        .int()
        .refine(
            (value) =>
                Number.isSafeInteger(value) &&
                value !== 0,
            {
                message:
                    "Adjustment amount must be a non-zero safe integer.",
            },
        ),

    reason: z
        .string()
        .trim()
        .min(
            10,
            "Provide a reason containing at least 10 characters.",
        )
        .max(
            500,
            "The reason cannot exceed 500 characters.",
        ),

    referenceId: z
        .string()
        .uuid(
            "A valid adjustment reference UUID is required.",
        ),
});

function getAuthenticatedAdminId(
    request: Request,
): string {
    const adminId = request.admin?.id;

    if (!adminId) {
        throw new AppError(
            "Administrator authentication is required.",
            401,
            "ADMIN_AUTH_REQUIRED",
        );
    }

    return adminId;
}

/**
 * POST /api/v1/admin/users/:userId/credits/adjust
 *
 * Required permission: credits:adjust
 */
export async function adjustUserListingCreditsController(
    request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const actorUserId =
            getAuthenticatedAdminId(request);

        const targetUserId =
            request.params.userId;

        if (
            typeof targetUserId !== "string" ||
            targetUserId.length === 0
        ) {
            throw new AppError(
                "A target user ID is required.",
                400,
                "TARGET_USER_ID_REQUIRED",
            );
        }

        const parsed =
            adjustmentSchema.safeParse(
                request.body,
            );

        if (!parsed.success) {
            throw new AppError(
                parsed.error.issues
                    .map((issue) => issue.message)
                    .join(" "),
                400,
                "INVALID_CREDIT_ADJUSTMENT",
            );
        }

        const result =
            await adjustUserListingCredits({
                actorUserId,
                targetUserId,
                amount: parsed.data.amount,
                reason: parsed.data.reason,
                referenceId: parsed.data.referenceId,

                ...(request.ip !== undefined
                    ? {
                          ipAddress: request.ip,
                      }
                    : {}),

                ...(request.get("user-agent") !==
                undefined
                    ? {
                          userAgent:
                              request.get("user-agent")!,
                      }
                    : {}),
            });

        response.status(
            result.inserted ? 201 : 200,
        ).json({
            success: true,
            message: result.inserted
                ? "Listing credits adjusted successfully."
                : "This adjustment was already processed.",
            data: result,
        });
    } catch (error) {
        next(error);
    }
}