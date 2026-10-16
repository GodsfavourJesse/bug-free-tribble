import type {
    Request,
    Response,
} from "express";

import {
    createConversation,
    getConversations,
} from "../messaging.service.ts";

export type AuthenticatedRequest<
    TBody = unknown,
> = Request<
    Record<string, string>,
    unknown,
    TBody
> & {
    user?: {
        id: string;
    };
};

interface CreateConversationBody {
    otherUserId?: unknown;
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
 * GET /api/v1/messaging/conversations
 */
export async function listConversations(
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
            message:
                "limit must be a positive integer between 1 and 50.",
        });

        return;
    }

    try {
        const result = await getConversations(
            request.user.id,
            {
                page,
                limit,
            },
        );

        response.status(200).json({
            success: true,
            data: result,
        });
    } catch {
        response.status(500).json({
            success: false,
            message:
                "Unable to retrieve conversations.",
        });
    }
}

/**
 * POST /api/v1/messaging/conversations
 */
export async function create(
    request: AuthenticatedRequest<CreateConversationBody>,
    response: Response,
): Promise<void> {
    if (!request.user) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });

        return;
    }

    const otherUserId =
        request.body?.otherUserId;

    if (
        typeof otherUserId !== "string" ||
        otherUserId.trim().length === 0
    ) {
        response.status(400).json({
            success: false,
            message: "otherUserId is required.",
        });

        return;
    }

    try {
        const conversation =
            await createConversation(
                request.user.id,
                otherUserId.trim(),
            );

        response.status(201).json({
            success: true,
            data: {
                conversation,
            },
        });
    } catch (error) {
        response.status(400).json({
            success: false,
            message:
                error instanceof Error
                    ? error.message
                    : "Unable to create conversation.",
        });
    }
}