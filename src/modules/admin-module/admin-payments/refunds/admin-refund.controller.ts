import type {
    Request,
    Response,
} from "express";

import {
    reviewRefundRequest,
} from "./admin-refund.service.ts";

import {
    executeOrReconcileRefund,
} from "./refund-execution.service.ts";

function getRequestString(
    value: string | string[] | undefined,
): string | undefined {
    return typeof value === "string"
        ? value
        : undefined;
}

function getErrorMessage(
    error: unknown,
    fallback: string,
): string {
    return error instanceof Error
        ? error.message
        : fallback;
}

/**
 * Reviews a refund request.
 *
 * Expected request body:
 * {
 *   "decision": "APPROVED" | "REJECTED",
 *   "reviewNote": "Optional review note"
 * }
 */
export async function reviewRefund(
    request: Request,
    response: Response,
): Promise<void> {
    const adminUserId = request.admin?.id;

    if (!adminUserId) {
        response.status(401).json({
            success: false,
            message: "Administrator authentication is required.",
        });
        return;
    }

    const refundId = getRequestString(
        request.params.refundId,
    );

    if (!refundId || refundId.trim().length === 0) {
        response.status(400).json({
            success: false,
            message: "A valid refund ID is required.",
        });
        return;
    }

    const body: unknown = request.body;

    if (
        typeof body !== "object" ||
        body === null ||
        Array.isArray(body)
    ) {
        response.status(400).json({
            success: false,
            message: "A valid request body is required.",
        });
        return;
    }

    const input = body as Record<string, unknown>;

    if (
        input.decision !== "APPROVED" &&
        input.decision !== "REJECTED"
    ) {
        response.status(400).json({
            success: false,
            message: "Decision must be APPROVED or REJECTED.",
        });
        return;
    }

    if (
        input.reviewNote !== undefined &&
        (
            typeof input.reviewNote !== "string" ||
            input.reviewNote.length > 1000
        )
    ) {
        response.status(400).json({
            success: false,
            message:
                "Review note must be a string of at most 1000 characters.",
        });
        return;
    }

    try {
        const userAgent = request.get("user-agent");

        const refund = await reviewRefundRequest({
            refundId: refundId.trim(),
            adminUserId,
            decision: input.decision,

            ...(typeof input.reviewNote === "string"
                ? { reviewNote: input.reviewNote }
                : {}),

            ...(request.ip !== undefined
                ? { ipAddress: request.ip }
                : {}),

            ...(userAgent !== undefined
                ? { userAgent }
                : {}),
        });

        response.status(200).json({
            success: true,
            message:
                refund.status === "APPROVED"
                    ? "Refund request approved. Refund processing has not yet completed."
                    : "Refund request rejected.",
            data: refund,
        });
    } catch (error: unknown) {
        const message = getErrorMessage(
            error,
            "Unable to review refund request.",
        );

        if (message === "Refund request not found.") {
            response.status(404).json({
                success: false,
                message,
            });
            return;
        }

        response.status(409).json({
            success: false,
            message,
        });
    }
}

/**
 * Executes or reconciles an approved refund.
 *
 * The service is responsible for provider communication,
 * idempotency, locking, and reconciliation.
 */
export async function executeRefund(
    request: Request,
    response: Response,
): Promise<void> {
    const adminUserId = request.admin?.id;

    if (!adminUserId) {
        response.status(401).json({
            success: false,
            message: "Administrator authentication is required.",
        });
        return;
    }

    const refundId = getRequestString(
        request.params.refundId,
    );

    if (!refundId || refundId.trim().length === 0) {
        response.status(400).json({
            success: false,
            message: "A valid refund ID is required.",
        });
        return;
    }

    try {
        const userAgent = request.get("user-agent");

        const refund = await executeOrReconcileRefund({
            refundId: refundId.trim(),
            adminUserId,

            ...(request.ip !== undefined
                ? { ipAddress: request.ip }
                : {}),

            ...(userAgent !== undefined
                ? { userAgent }
                : {}),
        });

        response.status(200).json({
            success: true,
            message:
                refund.status === "SUCCESS"
                    ? "Paystack confirmed that the refund was processed."
                    : refund.status === "FAILED"
                      ? "Paystack reported that the refund failed."
                      : "Refund status updated. Check its current status before taking further action.",
            data: refund,
        });
    } catch (error: unknown) {
        const message = getErrorMessage(
            error,
            "Unable to process the refund.",
        );

        response.status(409).json({
            success: false,
            message,
        });
    }
}