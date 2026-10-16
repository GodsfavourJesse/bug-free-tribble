import type {
    NextFunction,
    Request,
    Response,
} from "express";

import {
    createListingReport,
} from "./listing-report.service.ts";

import {
    createListingReportSchema,
} from "./listing-report.validation.ts";

export async function reportListing(
    request: Request<{
        id: string;
    }>,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        if (!request.user) {
            response.status(401).json({
                success: false,
                message:
                    "Authentication required.",
            });
            return;
        }

        const listingId =
            request.params.id?.trim();

        if (!listingId) {
            response.status(400).json({
                success: false,
                message:
                    "Listing id is required.",
            });
            return;
        }

        const parsed =
            createListingReportSchema.safeParse(
                request.body,
            );

        if (!parsed.success) {
            response.status(400).json({
                success: false,
                message:
                    "Invalid listing report.",
                errors:
                    parsed.error.flatten(),
            });
            return;
        }

        const report =
            await createListingReport(
                listingId,
                request.user.id,
                parsed.data,
            );

        response.status(201).json({
            success: true,
            message:
                "Listing report submitted successfully.",
            data: {
                report,
            },
        });
    } catch (error) {
        next(error);
    }
}