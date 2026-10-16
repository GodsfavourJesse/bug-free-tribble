import type {
    Request,
    Response,
} from "express";

import {
    createBoost,
    getBoostPlans,
} from "./boost.service.ts";

import {
    cancelPendingBoost,
} from "./boost-cancellation/boost-cancellation.service.ts";
import { boostHistoryQuerySchema } from "./boost.validation.ts";
import { getUserBoostHistory } from "./boost-history/boost-history.service.ts";
import { ZodError } from "zod";

/**
 * The authenticated user information required by this controller.
 */
type BoostAuthenticatedRequest = Request & {
    user?: {
        id: string;
    };
};

/**
 * GET /boosts/plans
 *
 * Return available boost plans.
 */
export async function plans(
    _request: Request,
    response: Response,
): Promise<void> {
    try {
        const result = await getBoostPlans();

        response.status(200).json({
            success: true,
            data: {
                plans: result,
            },
        });
    } catch {
        response.status(500).json({
            success: false,
            message: "Unable to retrieve boost plans.",
        });
    }
}

/**
 * POST /boosts
 *
 * Create a pending boost for an authenticated user.
 *
 * Payment initialization and activation are handled
 * separately by the existing payment flow.
 */
export async function create(
    request: BoostAuthenticatedRequest,
    response: Response,
): Promise<void> {
    if (!request.user?.id) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });

        return;
    }

    const {
        listingId,
        boostPlanId,
    } = request.body as {
        listingId?: unknown;
        boostPlanId?: unknown;
    };

    if (
        typeof listingId !== "string" ||
        typeof boostPlanId !== "string"
    ) {
        response.status(400).json({
            success: false,
            message: "listingId and boostPlanId are required.",
        });

        return;
    }

    try {
        const boost = await createBoost(
            request.user.id,
            listingId,
            boostPlanId,
        );

        response.status(201).json({
            success: true,
            message: "Boost request created successfully.",
            data: {
                boost,
            },
        });
    } catch (error) {
        response.status(400).json({
            success: false,
            message:
                error instanceof Error
                    ? error.message
                    : "Unable to create boost.",
        });
    }
}

/**
 * POST /boosts/:boostId/cancel
 *
 * Cancel a pending boost owned by the authenticated user.
 *
 * Active boosts and boosts with successful payments cannot
 * be cancelled through this endpoint.
 */
export async function cancel(
    request: BoostAuthenticatedRequest,
    response: Response,
): Promise<void> {
    if (!request.user?.id) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });

        return;
    }

    const boostId = request.params.boostId;

    if (
        typeof boostId !== "string" ||
        boostId.trim().length === 0
    ) {
        response.status(400).json({
            success: false,
            message: "A valid boost ID is required.",
        });

        return;
    }

    try {
        const result = await cancelPendingBoost(
            request.user.id,
            boostId,
        );

        response.status(200).json({
            success: true,
            message: result.message,
            data: {
                boost: result.boost,
            },
        });
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Unable to cancel boost.";

        const statusCode =
            message === "Boost not found."
                ? 404
                : 409;

        response.status(statusCode).json({
            success: false,
            message,
        });
    }
}

export async function history(
    request: BoostAuthenticatedRequest,
    response: Response,
): Promise<void> {
    try {
        if (!request.user?.id) {
            response.status(401).json({
                success: false,
                message: "Authentication required.",
            });
            return;
        }

        const query =
            boostHistoryQuerySchema.parse(
                request.query,
            );

        const result =
            await getUserBoostHistory(
                request.user.id,
                query.page,
                query.limit,
            );

        response.status(200).json({
            success: true,
            message: "Boost history retrieved successfully.",
            data: result.items,
            pagination: result.pagination,
        });
    } catch (error) {
        if (error instanceof ZodError) {
            response.status(400).json({
                success: false,
                message: "Invalid boost history filters.",
                errors: error.issues,
            });
            return;
        }

        response.status(500).json({
            success: false,
            message: "Unable to retrieve boost history.",
        });
    }
}
