import type {
    NextFunction,
    Request,
    Response,
} from "express";

import { z } from "zod";

import {
    isListingStatus,
    listAdminListingReports,
    listAdminListings,
    resolveAdminListingReport,
} from "./admin-listing-admin.service.ts";

const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

const reportStatusSchema = z.enum([
    "PENDING",
    "REVIEWING",
    "RESOLVED",
    "DISMISSED",
]);

const resolveReportSchema = z.object({
    decision: z.enum(["RESOLVED", "DISMISSED"]),
    resolutionNote: z.string().trim().max(2000).optional(),
});

export async function listAdminListingsController(
    request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const pagination = paginationSchema.parse(request.query);
        const rawStatus = request.query.status;
        const rawSearch = request.query.search;

        if (
            rawStatus !== undefined &&
            (
                typeof rawStatus !== "string" ||
                (rawStatus !== "ALL" && !isListingStatus(rawStatus))
            )
        ) {
            response.status(400).json({
                success: false,
                message: "Invalid listing status filter.",
            });
            return;
        }

        if (
            rawSearch !== undefined &&
            typeof rawSearch !== "string"
        ) {
            response.status(400).json({
                success: false,
                message: "search must be a single string.",
            });
            return;
        }

        const status = typeof rawStatus === "string" && rawStatus !== "ALL"
            ? rawStatus
            : undefined;

        const result = await listAdminListings({
            ...pagination,
            ...(status !== undefined && isListingStatus(status) ? { status } : {}),
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

export async function listAdminListingReportsController(
    request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const pagination = paginationSchema.parse(request.query);
        const rawStatus = request.query.status;

        let status: z.infer<typeof reportStatusSchema> | undefined;

        if (rawStatus !== undefined) {
            if (
                typeof rawStatus !== "string" ||
                !reportStatusSchema.safeParse(rawStatus).success
            ) {
                response.status(400).json({
                    success: false,
                    message: "Invalid listing report status.",
                });
                return;
            }
            status = rawStatus as z.infer<typeof reportStatusSchema>;
        }

        const result = await listAdminListingReports({
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

export async function resolveAdminListingReportController(
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

        const reportId = request.params.reportId;
        if (typeof reportId !== "string" || !z.string().uuid().safeParse(reportId).success) {
            response.status(400).json({
                success: false,
                message: "A valid report ID is required.",
            });
            return;
        }

        const body = resolveReportSchema.parse(request.body);
        const userAgent = request.get("user-agent");

        const result = await resolveAdminListingReport({
            reportId,
            adminId,
            decision: body.decision,
            ...(body.resolutionNote !== undefined
                ? { resolutionNote: body.resolutionNote }
                : {}),
            ...(request.ip !== undefined ? { ipAddress: request.ip } : {}),
            ...(userAgent !== undefined ? { userAgent } : {}),
        });

        response.status(200).json({
            success: true,
            message: `Listing report ${body.decision.toLowerCase()}.`,
            data: result,
        });
    } catch (error) {
        next(error);
    }
}
