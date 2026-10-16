import type {
    Request,
    Response,
} from "express";

import {
    ZodError,
    z,
} from "zod";

import {
    listDealerApplications,
    reviewDealer,
    reviewDealerDocument,
} from "./admin-dealer.service.ts";

/* =========================================================
   HELPERS
========================================================= */

function actor(
    request: Request,
): string {
    const user = request.admin;

    if (!user) {
        throw new Error(
            "Authentication required.",
        );
    }

    return user.id;
}

/* =========================================================
   LIST DEALER APPLICATIONS
========================================================= */

export async function dealers(
    request: Request,
    response: Response,
): Promise<void> {
    try {
        const statusQuery =
            request.query.status;

        if (
            statusQuery !== undefined &&
            statusQuery !== "PENDING" &&
            statusQuery !== "APPROVED" &&
            statusQuery !== "REJECTED"
        ) {
            response.status(400).json({
                success: false,
                message:
                    "Invalid dealer application status.",
            });

            return;
        }

        const status =
            statusQuery === "PENDING" ||
            statusQuery === "APPROVED" ||
            statusQuery === "REJECTED"
                ? statusQuery
                : undefined;

        const applications =
            await listDealerApplications(
                status,
            );

        response.status(200).json({
            success: true,
            data: {
                applications,
            },
        });
    } catch (error) {
        response.status(500).json({
            success: false,
            message:
                error instanceof Error
                    ? error.message
                    : "Unable to retrieve dealer applications.",
        });
    }
}

/* =========================================================
   REVIEW DEALER APPLICATION
========================================================= */

export async function reviewDealerApplication(
    request: Request,
    response: Response,
): Promise<void> {
    try {
        const input = z
            .object({
                decision: z.enum([
                    "APPROVED",
                    "REJECTED",
                ]),

                rejectionReason: z
                    .string()
                    .trim()
                    .max(1000)
                    .optional(),
            })
            .parse(request.body);

        const applicationId =
            request.params.applicationId;

        if (
            typeof applicationId !== "string" ||
            !applicationId.trim()
        ) {
            response.status(400).json({
                success: false,
                message:
                    "A valid application ID is required.",
            });

            return;
        }

        if (
            input.decision === "REJECTED" &&
            !input.rejectionReason?.trim()
        ) {
            response.status(400).json({
                success: false,
                message:
                    "A rejection reason is required.",
            });

            return;
        }

        const application =
            await reviewDealer(
                applicationId,
                actor(request),
                input.decision,
                input.rejectionReason,
            );

        response.status(200).json({
            success: true,
            data: {
                application,
            },
        });
    } catch (error) {
        response.status(400).json({
            success: false,
            message:
                error instanceof ZodError
                    ? "Invalid dealer review."
                    : error instanceof Error
                      ? error.message
                      : "Unable to review dealer application.",
        });
    }
}

/* =========================================================
   REVIEW DEALER VERIFICATION DOCUMENT
========================================================= */

export async function reviewDealerVerificationDocument(
    request: Request,
    response: Response,
): Promise<void> {
    try {
        const input = z
            .object({
                decision: z.enum([
                    "APPROVED",
                    "REJECTED",
                ]),

                rejectionReason: z
                    .string()
                    .trim()
                    .max(1000)
                    .optional(),
            })
            .parse(request.body);

        const documentId =
            request.params.documentId;

        if (
            typeof documentId !== "string" ||
            !documentId.trim()
        ) {
            response.status(400).json({
                success: false,
                message:
                    "A valid dealer document ID is required.",
            });

            return;
        }

        if (
            input.decision === "REJECTED" &&
            !input.rejectionReason?.trim()
        ) {
            response.status(400).json({
                success: false,
                message:
                    "A rejection reason is required when rejecting a dealer document.",
            });

            return;
        }

        const document =
            await reviewDealerDocument(
                documentId,
                actor(request),
                input.decision,
                input.rejectionReason,
            );

        response.status(200).json({
            success: true,
            data: {
                document,
            },
        });
    } catch (error) {
        response.status(400).json({
            success: false,
            message:
                error instanceof ZodError
                    ? "Invalid dealer document review."
                    : error instanceof Error
                      ? error.message
                      : "Unable to review dealer document.",
        });
    }
}