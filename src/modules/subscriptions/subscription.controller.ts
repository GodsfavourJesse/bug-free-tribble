import type {
    Request,
    Response,
} from "express";

import {
    getCreditBalance,
    getCurrentSubscription,
    getSubscriptionPlanPrice,
} from "./subscription.service.ts";

import { db } from "../../database/index.ts";

import {
    subscriptionPlans,
} from "../../database/schema/index.ts";

import { eq } from "drizzle-orm";
import { AppError } from "../../errors/app-error.ts";

export async function plans(
    _request: Request,
    response: Response,
): Promise<void> {
    const result = await db
        .select()
        .from(subscriptionPlans)
        .where(
            eq(
                subscriptionPlans.active,
                true,
            ),
        );

    response.json({
        success: true,
        data: {
            plans: result,
        },
    });
}

export async function current(
    request: Request,
    response: Response,
): Promise<void> {
    const user = request.user;

    if (!user) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });

        return;
    }

    const [
        subscription,
        creditBalance,
    ] = await Promise.all([
        getCurrentSubscription(user.id),
        getCreditBalance(user.id),
    ]);

    response.json({
        success: true,
        data: {
            subscription,
            creditBalance,
        },
    });
}

export async function price(
    request: Request,
    response: Response,
): Promise<void> {
    const user = request.user;

    if (!user) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });

        return;
    }

    const planId = request.params.planId;

    if (
        typeof planId !== "string" ||
        !planId
    ) {
        response.status(400).json({
            success: false,
            message: "planId is required.",
        });

        return;
    }

    try {
        const result =
            await getSubscriptionPlanPrice(
                user.id,
                planId,
            );

        response.json({
            success: true,
            data: {
                price: result,
            },
        });
    } catch (error) {
        if (error instanceof AppError) {
            response.status(error.statusCode).json({
                success: false,
                message: error.message,
                code: error.code,
            });

            return;
        }

        console.error(
            "Get subscription price error:",
            error,
        );

        response.status(500).json({
            success: false,
            message: "Unable to retrieve subscription pricing.",
        });
    }
}