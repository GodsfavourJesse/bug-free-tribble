import type {
    Request,
    Response,
} from "express";

import { z, ZodError } from "zod";

import {
    getAdminSubscriptionHistory,
    SubscriptionHistoryError,
} from "./admin-subscription-history.service.ts";

function sendHistoryError(
    response: Response,
    error: unknown,
): void {
    if (error instanceof ZodError) {
        response.status(400).json({
            success: false,
            message: "Invalid subscription history request.",
            errors: error.issues.map((issue) => ({
                path: issue.path.join("."),
                message: issue.message,
            })),
        });

        return;
    }

    if (error instanceof SubscriptionHistoryError) {
        response.status(error.statusCode).json({
            success: false,
            message: error.message,
        });

        return;
    }

    response.status(500).json({
        success: false,
        message: "Unable to retrieve subscription history.",
    });
}

export async function subscriptionHistoryList(
    request: Request,
    response: Response,
): Promise<void> {
    try {
        const params = z.object({
            subscriptionId: z.string().uuid(),
        }).parse(request.params);

        const query = z.object({
            page: z.coerce.number().int().min(1).default(1),
            limit: z.coerce.number().int().min(1).max(100).default(20),
        }).parse(request.query);

        const result = await getAdminSubscriptionHistory({
            subscriptionId: params.subscriptionId,
            page: query.page,
            limit: query.limit,
        });

        response.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        sendHistoryError(response, error);
    }
}