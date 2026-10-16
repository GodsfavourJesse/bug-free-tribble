import type {
    Response,
} from "express";

import type {
    AuthenticatedRequest,
} from "./conversation.controller.ts";

import {
    getMessages,
    sendMessage,
} from "../messaging.service.ts";

interface SendMessageBody {
    body?: unknown;
}

function getRequiredParam(
    value: string | string[] | undefined,
): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();

    return trimmed.length > 0
        ? trimmed
        : null;
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
 * GET /api/v1/messaging/conversations/:conversationId/messages
 *
 * Query parameters:
 * - page: positive integer, default 1
 * - limit: integer from 1 to 100, default 50
 */
export async function messages(
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

    const conversationId = getRequiredParam(
        request.params.conversationId,
    );

    if (!conversationId) {
        response.status(400).json({
            success: false,
            message: "conversationId is required.",
        });

        return;
    }

    const page = getPositiveInteger(
        request.query.page,
        1,
    );

    const limit = getPositiveInteger(
        request.query.limit,
        50,
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
            message:
                "limit must be a positive integer between 1 and 100.",
        });

        return;
    }

    try {
        const result = await getMessages(
            conversationId,
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
    } catch (error) {
        const errorMessage =
            error instanceof Error
                ? error.message
                : "Unable to retrieve messages.";

        const forbidden =
            errorMessage ===
            "You are not a participant in this conversation.";

        const invalidPagination =
            errorMessage ===
            "Invalid message pagination options." ||
            errorMessage ===
            "Message pagination offset is too large.";

        response.status(
            forbidden
                ? 403
                : invalidPagination
                    ? 400
                    : 500,
        ).json({
            success: false,
            message: forbidden
                ? errorMessage
                : invalidPagination
                    ? errorMessage
                    : "Unable to retrieve messages.",
        });
    }
}

/**
 * POST /api/v1/messaging/conversations/:conversationId/messages
 */
export async function send(
    request: AuthenticatedRequest<SendMessageBody>,
    response: Response,
): Promise<void> {
    if (!request.user) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });

        return;
    }

    const conversationId = getRequiredParam(
        request.params.conversationId,
    );

    if (!conversationId) {
        response.status(400).json({
            success: false,
            message: "conversationId is required.",
        });

        return;
    }

    const body = request.body?.body;

    if (
        typeof body !== "string" ||
        body.trim().length === 0
    ) {
        response.status(400).json({
            success: false,
            message: "Message body is required.",
        });

        return;
    }

    const messageBody = body.trim();

    if (messageBody.length > 5000) {
        response.status(400).json({
            success: false,
            message:
                "Message body cannot exceed 5000 characters.",
        });

        return;
    }

    try {
        const message = await sendMessage(
            conversationId,
            request.user.id,
            messageBody,
        );

        response.status(201).json({
            success: true,
            data: {
                message,
            },
        });
    } catch (error) {
        const errorMessage =
            error instanceof Error
                ? error.message
                : "Unable to send message.";

        const forbidden =
            errorMessage ===
            "You are not a participant in this conversation.";

        response.status(
            forbidden ? 403 : 500,
        ).json({
            success: false,
            message: forbidden
                ? errorMessage
                : "Unable to send message.",
        });
    }
}