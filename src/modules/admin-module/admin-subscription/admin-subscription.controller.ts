import type {
    Request,
    Response,
} from "express";

import { ZodError, z } from "zod";

import {
    createPlan,
    listAdminSubscriptions,
    listPlans,
    SubscriptionPlanError,
    updatePlan,
} from "./admin-subscription.service.ts";

import {
    createSubscriptionPlanSchema,
    updateSubscriptionPlanSchema,
} from "./admin-subscription.validation.ts";

function getActorId(request: Request): string {
    if (!request.admin) {
        throw new SubscriptionPlanError(
            "Authentication required.",
            401,
        );
    }

    return request.admin.id;
}

function getAuditMetadata(request: Request): {
    ipAddress?: string;
    userAgent?: string;
} {
    const ipAddress = request.ip;
    const userAgent = request.get("user-agent");

    return {
        ...(ipAddress
            ? { ipAddress }
            : {}),
        ...(userAgent
            ? { userAgent }
            : {}),
    };
}

function sendError(
    response: Response,
    error: unknown,
    fallback: string,
): void {
    if (error instanceof ZodError) {
        response.status(400).json({
            success: false,
            message: "Invalid subscription plan data.",
            errors: error.issues.map((issue) => ({
                path: issue.path.join("."),
                message: issue.message,
            })),
        });

        return;
    }

    if (error instanceof SubscriptionPlanError) {
        response.status(error.statusCode).json({
            success: false,
            message: error.message,
        });

        return;
    }

    if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
    ) {
        response.status(409).json({
            success: false,
            message:
                "A subscription plan with this name already exists.",
        });

        return;
    }

    response.status(500).json({
        success: false,
        message: fallback,
    });
}


export async function subscriptionsList(
    request: Request,
    response: Response,
): Promise<void> {
    try {
        const query = z.object({
            page: z.coerce.number().int().min(1).default(1),
            limit: z.coerce.number().int().min(1).max(100).default(20),
            status: z.enum(["PENDING", "ACTIVE", "EXPIRED", "CANCELLED"]).optional(),
        }).parse(request.query);

        const result = await listAdminSubscriptions({
            page: query.page,
            limit: query.limit,
            ...(query.status !== undefined
                ? { status: query.status }
                : {}),
        });

        response.status(200).json({
            success: true,
            data: result.items,
            pagination: result.pagination,
        });
    } catch (error) {
        sendError(response, error, "Unable to retrieve subscriptions.");
    }
}

export async function plans(
    _request: Request,
    response: Response,
): Promise<void> {
    try {
        const result = await listPlans();

        response.json({
            success: true,
            data: {
                plans: result,
            },
        });
    } catch {
        response.status(500).json({
            success: false,
            message: "Unable to retrieve subscription plans.",
        });
    }
}

export async function createSubscriptionPlan(
    request: Request,
    response: Response,
): Promise<void> {
    try {
        const input =
            createSubscriptionPlanSchema.parse(
                request.body,
            );

        const plan = await createPlan(
            {
                ...input,
                price: input.price.toFixed(2),
            },
            getActorId(request),
            getAuditMetadata(request),
        );

        response.status(201).json({
            success: true,
            data: { plan },
        });
    } catch (error) {
        sendError(
            response,
            error,
            "Unable to create subscription plan.",
        );
    }
}

export async function updateSubscriptionPlan(
    request: Request,
    response: Response,
): Promise<void> {
    try {
        const planId = request.params.planId;

        if (
            typeof planId !== "string" ||
            !planId
        ) {
            response.status(400).json({
                success: false,
                message: "A valid plan ID is required.",
            });

            return;
        }

        const input =
            updateSubscriptionPlanSchema.parse(
                request.body,
            );

        if (Object.keys(input).length === 0) {
            response.status(400).json({
                success: false,
                message:
                    "Provide at least one field to update.",
            });

            return;
        }

        const normalized = {
            ...(input.name !== undefined
                ? { name: input.name }
                : {}),
            ...(input.description !== undefined
                ? { description: input.description }
                : {}),
            ...(input.price !== undefined
                ? { price: input.price.toFixed(2) }
                : {}),
            ...(input.currency !== undefined
                ? { currency: input.currency }
                : {}),
            ...(input.durationDays !== undefined
                ? { durationDays: input.durationDays }
                : {}),
            ...(input.listingCredits !== undefined
                ? { listingCredits: input.listingCredits }
                : {}),
            ...(input.dealerDiscountPercent !== undefined
                ? {
                    dealerDiscountPercent:
                        input.dealerDiscountPercent,
                }
                : {}),
            ...(input.active !== undefined
                ? { active: input.active }
                : {}),
        };

        const plan = await updatePlan(
            planId,
            normalized,
            getActorId(request),
            getAuditMetadata(request),
        );

        response.json({
            success: true,
            data: { plan },
        });
    } catch (error) {
        sendError(
            response,
            error,
            "Unable to update subscription plan.",
        );
    }
}