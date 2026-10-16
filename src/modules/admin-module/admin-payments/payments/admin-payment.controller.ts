import type {
    NextFunction,
    Request,
    Response,
} from "express";

import { z } from "zod";

import {
    isPaymentStatus,
    listPaymentReconciliations,
    listPayments,
    listRefundRequests,
    retryPaymentReconciliation,
} from "./admin-payment.service.ts";

const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

const refundStatusSchema = z.enum([
    "PENDING",
    "APPROVED",
    "PROCESSING",
    "SUCCESS",
    "FAILED",
    "REJECTED",
]);

const reconciliationStatusSchema = z.enum([
    "PENDING",
    "PROCESSING",
    "RETRY",
    "RESOLVED",
    "DEAD_LETTER",
    "IGNORED",
]);

async function listPaymentsResponse(
    request: Request,
    response: Response,
    next: NextFunction,
    forcedStatus?: "FAILED",
): Promise<void> {
    try {
        const pagination = paginationSchema.parse(request.query);
        const rawStatus = forcedStatus ?? request.query.status;
        const rawPurpose = request.query.purpose;
        const rawSearch = request.query.search;

        if (
            rawStatus !== undefined &&
            (
                typeof rawStatus !== "string" ||
                !isPaymentStatus(rawStatus)
            )
        ) {
            response.status(400).json({
                success: false,
                message: "Invalid payment status filter.",
            });
            return;
        }

        if (
            rawPurpose !== undefined &&
            rawPurpose !== "SUBSCRIPTION" &&
            rawPurpose !== "BOOST"
        ) {
            response.status(400).json({
                success: false,
                message: "purpose must be SUBSCRIPTION or BOOST.",
            });
            return;
        }

        if (rawSearch !== undefined && typeof rawSearch !== "string") {
            response.status(400).json({
                success: false,
                message: "search must be a single string.",
            });
            return;
        }

        const result = await listPayments({
            ...pagination,
            ...(typeof rawStatus === "string" && isPaymentStatus(rawStatus)
                ? { status: rawStatus }
                : {}),
            ...(rawPurpose === "SUBSCRIPTION" || rawPurpose === "BOOST"
                ? { purpose: rawPurpose }
                : {}),
            ...(typeof rawSearch === "string" && rawSearch.trim()
                ? { search: rawSearch.trim().slice(0, 100) }
                : {}),
        });

        response.status(200).json({
            success: true,
            data: result.items,
            pagination: result.pagination,
        });
    } catch (error) {
        next(error);
    }
}

export async function payments(
    request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    return listPaymentsResponse(request, response, next);
}

export async function failedPayments(
    request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    return listPaymentsResponse(request, response, next, "FAILED");
}

export async function refunds(
    request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const pagination = paginationSchema.parse(request.query);
        const rawStatus = request.query.status;

        let status: z.infer<typeof refundStatusSchema> | undefined;

        if (rawStatus !== undefined) {
            if (
                typeof rawStatus !== "string" ||
                !refundStatusSchema.safeParse(rawStatus).success
            ) {
                response.status(400).json({
                    success: false,
                    message: "Invalid refund status filter.",
                });
                return;
            }
            status = rawStatus as z.infer<typeof refundStatusSchema>;
        }

        const result = await listRefundRequests({
            ...pagination,
            ...(status !== undefined ? { status } : {}),
        });

        response.status(200).json({
            success: true,
            data: result.items,
            pagination: result.pagination,
        });
    } catch (error) {
        next(error);
    }
}

export async function reconciliations(
    request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const pagination = paginationSchema.parse(request.query);
        const rawStatus = request.query.status;

        let status: z.infer<typeof reconciliationStatusSchema> | undefined;

        if (rawStatus !== undefined) {
            if (
                typeof rawStatus !== "string" ||
                !reconciliationStatusSchema.safeParse(rawStatus).success
            ) {
                response.status(400).json({
                    success: false,
                    message: "Invalid reconciliation status filter.",
                });
                return;
            }
            status = rawStatus as z.infer<typeof reconciliationStatusSchema>;
        }

        const result = await listPaymentReconciliations({
            ...pagination,
            ...(status !== undefined ? { status } : {}),
        });

        response.status(200).json({
            success: true,
            data: result.items,
            pagination: result.pagination,
        });
    } catch (error) {
        next(error);
    }
}

export async function retryReconciliation(
    request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const adminId = request.admin?.id;
        if (!adminId) {
            response.status(401).json({
                success: false,
                message: "Administrator authentication required.",
            });
            return;
        }

        const reconciliationId = request.params.reconciliationId;
        if (
            typeof reconciliationId !== "string" ||
            !z.string().uuid().safeParse(reconciliationId).success
        ) {
            response.status(400).json({
                success: false,
                message: "A valid reconciliation ID is required.",
            });
            return;
        }

        const userAgent = request.get("user-agent");
        const result = await retryPaymentReconciliation({
            reconciliationId,
            adminId,
            ...(request.ip !== undefined ? { ipAddress: request.ip } : {}),
            ...(userAgent !== undefined ? { userAgent } : {}),
        });

        response.status(200).json({
            success: true,
            message: "Payment reconciliation re-queued for the existing worker.",
            data: result,
        });
    } catch (error) {
        next(error);
    }
}
