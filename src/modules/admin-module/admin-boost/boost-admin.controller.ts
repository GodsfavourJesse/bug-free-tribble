import type {
    Request,
    Response,
} from "express";

import {
    ZodError,
    z,
} from "zod";

import {
    approveBoostRequest,
    getAdminBoostDetails,
    listAdminBoosts,
    rejectBoostRequest,
} from "./boost-admin.service.ts";

import type {
    AdminBoostStatus,
} from "./boost-admin.service.ts";

type AuthenticatedAdminRequest = Request & {
    user?: {
        id: string;
    };
};

const boostStatusSchema = z.enum([
    "PENDING",
    "AWAITING_APPROVAL",
    "ACTIVE",
    "REJECTED",
    "EXPIRED",
    "CANCELLED",
]);

const listBoostsQuerySchema = z.object({
    status: boostStatusSchema.optional(),

    page: z.coerce
        .number()
        .int()
        .positive()
        .default(1),

    limit: z.coerce
        .number()
        .int()
        .positive()
        .max(100)
        .default(20),
});

const boostIdSchema = z.object({
    boostId: z.string().uuid(),
});

const reviewBoostSchema = z.object({
    reviewNote: z.string().trim().max(2000).optional(),
});

const rejectBoostSchema = z.object({
    reviewNote: z
        .string()
        .trim()
        .min(1, "A rejection reason is required.")
        .max(2000),
});

function getErrorMessage(
    error: unknown,
): string {
    return error instanceof Error
        ? error.message
        : "An unexpected error occurred.";
}

function isConflictError(
    message: string,
): boolean {
    return (
        message.includes("Only boost requests") ||
        message.includes("Payment must be verified") ||
        message.includes("successful boost payment") ||
        message.includes("payment ownership") ||
        message.includes("payment timestamp") ||
        message.includes("Another boost") ||
        message.includes("associated listing must be approved") ||
        message.includes("changed before") ||
        message.includes("rejection reason")
    );
}

/**
 * GET /admin/boosts
 */
export async function adminListBoosts(
    request: Request,
    response: Response,
): Promise<void> {
    try {
        const query = listBoostsQuerySchema.parse(
            request.query,
        );

        const filters: {
            status?: AdminBoostStatus;
            page: number;
            limit: number;
        } = {
            page: query.page,
            limit: query.limit,
        };

        if (query.status) {
            filters.status = query.status;
        }

        const result = await listAdminBoosts(filters);

        response.status(200).json({
            success: true,
            message: "Boost requests retrieved successfully.",
            data: result.items,
            pagination: result.pagination,
        });
    } catch (error: unknown) {
        if (error instanceof ZodError) {
            response.status(400).json({
                success: false,
                message: "Invalid boost filters.",
                errors: error.issues,
            });
            return;
        }

        response.status(500).json({
            success: false,
            message: "Unable to retrieve boost requests.",
        });
    }
}

/**
 * GET /admin/boosts/:boostId
 */
export async function adminGetBoostDetails(
    request: Request,
    response: Response,
): Promise<void> {
    try {
        const { boostId } = boostIdSchema.parse(
            request.params,
        );

        const result = await getAdminBoostDetails(
            boostId,
        );

        response.status(200).json({
            success: true,
            message: "Boost details retrieved successfully.",
            data: result,
        });
    } catch (error: unknown) {
        if (error instanceof ZodError) {
            response.status(400).json({
                success: false,
                message: "Invalid boost ID.",
                errors: error.issues,
            });
            return;
        }

        if (
            error instanceof Error &&
            error.message === "Boost not found."
        ) {
            response.status(404).json({
                success: false,
                message: error.message,
            });
            return;
        }

        response.status(500).json({
            success: false,
            message: "Unable to retrieve boost details.",
        });
    }
}

/**
 * PATCH /admin/boosts/:boostId/approve
 */
export async function adminApproveBoost(
    request: AuthenticatedAdminRequest,
    response: Response,
): Promise<void> {
    try {
        if (!request.admin?.id) {
            response.status(401).json({
                success: false,
                message: "Authentication required.",
            });
            return;
        }

        const { boostId } = boostIdSchema.parse(
            request.params,
        );

        const body = reviewBoostSchema.parse(
            request.body ?? {},
        );

        const result = await approveBoostRequest({
            boostId,
            adminUserId: request.admin.id,
            ...(body.reviewNote !== undefined
                ? {
                    reviewNote: body.reviewNote,
                }
                : {}),
        });

        response.status(200).json({
            success: true,
            message: "Boost approved and activated successfully.",
            data: result,
        });
    } catch (error: unknown) {
        if (error instanceof ZodError) {
            response.status(400).json({
                success: false,
                message: "Invalid boost approval request.",
                errors: error.issues,
            });
            return;
        }

        const message = getErrorMessage(error);

        if (message === "Boost not found.") {
            response.status(404).json({
                success: false,
                message,
            });
            return;
        }

        if (isConflictError(message)) {
            response.status(409).json({
                success: false,
                message,
            });
            return;
        }

        response.status(500).json({
            success: false,
            message: "Unable to approve boost request.",
        });
    }
}

/**
 * PATCH /admin/boosts/:boostId/reject
 */
export async function adminRejectBoost(
    request: AuthenticatedAdminRequest,
    response: Response,
): Promise<void> {
    try {
        if (!request.admin?.id) {
            response.status(401).json({
                success: false,
                message: "Authentication required.",
            });
            return;
        }

        const { boostId } = boostIdSchema.parse(
            request.params,
        );

        const body = rejectBoostSchema.parse(
            request.body ?? {},
        );

        const result = await rejectBoostRequest({
            boostId,
            adminUserId: request.admin.id,
            reviewNote: body.reviewNote,
        });

        response.status(200).json({
            success: true,
            message: "Boost request rejected successfully.",
            data: result,
        });
    } catch (error: unknown) {
        if (error instanceof ZodError) {
            response.status(400).json({
                success: false,
                message: "Invalid boost rejection request.",
                errors: error.issues,
            });
            return;
        }

        const message = getErrorMessage(error);

        if (message === "Boost not found.") {
            response.status(404).json({
                success: false,
                message,
            });
            return;
        }

        if (isConflictError(message)) {
            response.status(409).json({
                success: false,
                message,
            });
            return;
        }

        response.status(500).json({
            success: false,
            message: "Unable to reject boost request.",
        });
    }
}
