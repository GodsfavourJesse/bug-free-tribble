import type {
    Response,
} from "express";

import type {
    AuthenticatedRequest,
} from "./conversation.controller.ts";

import {
    createSupportTicket,
    getMySupportTickets,
} from "../messaging.service.ts";

interface CreateSupportTicketBody {
    subject?: unknown;
}

function getPositiveInteger(
    value: unknown,
    defaultValue: number,
): number | null {
    if (value === undefined) {
        return defaultValue;
    }

    if (
        typeof value !== "string" ||
        !/^\d+$/.test(value)
    ) {
        return null;
    }

    const parsed = Number(value);

    if (
        !Number.isSafeInteger(parsed) ||
        parsed < 1
    ) {
        return null;
    }

    return parsed;
}

/**
 * POST /support/tickets
 *
 * Creates a support ticket for the authenticated customer.
 */
export async function createTicket(
    request: AuthenticatedRequest<CreateSupportTicketBody>,
    response: Response,
): Promise<void> {
    if (!request.user) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });
        return;
    }

    const subject = request.body?.subject;

    if (typeof subject !== "string") {
        response.status(400).json({
            success: false,
            message: "A ticket subject is required.",
        });
        return;
    }

    try {
        const ticket = await createSupportTicket(
            request.user.id,
            subject,
        );

        response.status(201).json({
            success: true,
            message: "Support ticket created successfully.",
            data: {
                ticket,
            },
        });
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Unable to create support ticket.";

        if (
            message.includes("subject must be between") ||
            message.includes("Authentication is required")
        ) {
            response.status(400).json({
                success: false,
                message,
            });
            return;
        }

        response.status(500).json({
            success: false,
            message: "Unable to create support ticket.",
        });
    }
}

/**
 * GET /support/tickets
 *
 * Returns only support tickets belonging to the authenticated
 * customer.
 */
export async function listMyTickets(
    request: AuthenticatedRequest,
    response: Response,
): Promise<void> {
    if (!request.user) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });
        return;
    }

    const page = getPositiveInteger(
        request.query.page,
        1,
    );

    const limit = getPositiveInteger(
        request.query.limit,
        20,
    );

    if (page === null) {
        response.status(400).json({
            success: false,
            message: "page must be a positive integer.",
        });
        return;
    }

    if (limit === null || limit > 50) {
        response.status(400).json({
            success: false,
            message: "limit must be between 1 and 50.",
        });
        return;
    }

    try {
        const result = await getMySupportTickets(
            request.user.id,
            page,
            limit,
        );

        response.status(200).json({
            success: true,
            data: result,
        });
    } catch {
        response.status(500).json({
            success: false,
            message: "Unable to retrieve support tickets.",
        });
    }
}