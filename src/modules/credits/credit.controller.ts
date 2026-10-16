import type {
    NextFunction,
    Request,
    Response,
} from "express";

import {
    getCreditBalance,
    getCreditHistory,
} from "./credit.service.ts";

import { AppError } from "../../errors/app-error.ts";
import { creditHistoryQuerySchema } from "./credit.validation.ts";

function getAuthenticatedUserId(
    req: Request,
): string {
    const userId = req.user?.id;

    if (!userId) {
        throw new AppError(
            "Authentication is required.",
            401,
            "UNAUTHENTICATED",
        );
    }

    return userId;
}

/**
 * GET /api/credits/balance
 *
 * Returns the authenticated user's listing-credit balance.
 */
export async function getCreditBalanceController(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const userId = getAuthenticatedUserId(req);

        const result = await getCreditBalance(userId);

        res.status(200).json({
            success: true,
            data: {
                balance: result.balance,
            },
        });
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/credits/history?page=1&limit=20
 *
 * Returns the authenticated user's paginated credit history.
 */
export async function getCreditHistoryController(
    req: Request,
    res: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const userId = getAuthenticatedUserId(req);

        const query = creditHistoryQuerySchema.safeParse(
            req.query,
        );

        if (!query.success) {
            throw new AppError(
                "Invalid credit history pagination parameters.",
                400,
                "INVALID_PAGINATION",
            );
        }

        const result = await getCreditHistory(
            userId,
            {
                page: query.data.page,
                limit: query.data.limit,
            },
        );

        res.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        next(error);
    }
}