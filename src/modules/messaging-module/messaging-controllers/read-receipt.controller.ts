import type {
    Response,
} from "express";

import type {
    AuthenticatedRequest,
} from "./conversation.controller.ts";

import {
    getConversationReadReceipts,
    markConversationAsRead,
} from "../messaging.service.ts";

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

/**
 * POST /api/v1/messaging/conversations/:conversationId/read
 */
export async function markRead(
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

    try {
        const receipt =
            await markConversationAsRead(
                conversationId,
                request.user.id,
            );

        response.status(200).json({
            success: true,
            data: {
                receipt,
            },
        });
    } catch (error) {
        const errorMessage =
            error instanceof Error
                ? error.message
                : "Unable to mark conversation as read.";

        const forbidden =
            errorMessage ===
            "You are not a participant in this conversation.";

        response.status(
            forbidden ? 403 : 500,
        ).json({
            success: false,
            message: forbidden
                ? errorMessage
                : "Unable to mark conversation as read.",
        });
    }
}

/**
 * GET /api/v1/messaging/conversations/:conversationId/read-receipts
 */
export async function readReceipts(
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

    try {
        const receipts =
            await getConversationReadReceipts(
                conversationId,
                request.user.id,
            );

        response.status(200).json({
            success: true,
            data: {
                receipts,
            },
        });
    } catch (error) {
        const errorMessage =
            error instanceof Error
                ? error.message
                : "Unable to retrieve read receipts.";

        const forbidden =
            errorMessage ===
            "You are not a participant in this conversation.";

        response.status(
            forbidden ? 403 : 500,
        ).json({
            success: false,
            message: forbidden
                ? errorMessage
                : "Unable to retrieve read receipts.",
        });
    }
}