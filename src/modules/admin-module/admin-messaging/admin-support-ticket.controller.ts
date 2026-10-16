import type {
    Request,
    Response,
} from "express";

import {
    getAdminSupportTickets,
} from "./admin-messaging.service.ts";

type AdminAuthenticatedRequest = Request & {
    admin?: {
        id: string;
    };
};

const ALLOWED_STATUSES = [
    "OPEN",
    "IN_PROGRESS",
    "RESOLVED",
    "CLOSED",
] as const;

type SupportTicketStatus =
    typeof ALLOWED_STATUSES[number];

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

function isSupportTicketStatus(
    value: string,
): value is SupportTicketStatus {
    return (
        ALLOWED_STATUSES as readonly string[]
    ).includes(value);
}

/**
 * GET /api/v1/admin/messaging/support/tickets
 *
 * Query parameters:
 * - page: positive integer, default 1
 * - limit: positive integer, default 20, maximum 100
 * - status: optional support-ticket status
 */
export async function listAdminSupportTickets(
    request: AdminAuthenticatedRequest,
    response: Response,
): Promise<void> {
    if (!request.admin?.id) {
        response.status(401).json({
            success: false,
            message: "Administrator authentication required.",
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

    if (limit === null || limit > 100) {
        response.status(400).json({
            success: false,
            message: "limit must be between 1 and 100.",
        });

        return;
    }

    const rawStatus = request.query.status;

    let status: SupportTicketStatus | undefined;

    if (rawStatus !== undefined) {
        if (
            typeof rawStatus !== "string" ||
            !isSupportTicketStatus(rawStatus)
        ) {
            response.status(400).json({
                success: false,
                message:
                    "status must be OPEN, IN_PROGRESS, RESOLVED, or CLOSED.",
            });

            return;
        }

        status = rawStatus;
    }

    try {
        const result = await getAdminSupportTickets({
            page,
            limit,
            ...(status !== undefined
                ? { status }
                : {}),
        });

        response.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        console.error(
            "Unable to retrieve admin support tickets.",
            error,
        );

        response.status(500).json({
            success: false,
            message: "Unable to retrieve support tickets.",
        });
    }
}