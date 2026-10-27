import type {
    Request,
    Response,
} from "express";

import {
    ZodError,
    z,
} from "zod";

import {
    getAdminDealerDocumentSignedUrl,
    listDealerApplicationHistory,
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
        const statusQuery = request.query.status;

        type ApplicationStatus =
            | "PENDING"
            | "APPROVED"
            | "REJECTED";

        let status: ApplicationStatus | "ALL" = "PENDING";

        if (statusQuery !== undefined) {
            if (
                statusQuery !== "ALL" &&
                statusQuery !== "PENDING" &&
                statusQuery !== "APPROVED" &&
                statusQuery !== "REJECTED"
            ) {
                response.status(400).json({
                    success: false,
                    message:
                        "Status must be ALL, PENDING, APPROVED, or REJECTED.",
                });

                return;
            }

            status = statusQuery as ApplicationStatus | "ALL";
        }

        const page = Number(request.query.page ?? 1);
        const limit = Number(request.query.limit ?? 20);

        if (
            !Number.isInteger(page) ||
            page < 1 ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 100
        ) {
            response.status(400).json({
                success: false,
                message: "Invalid pagination parameters.",
            });

            return;
        }

        const result = await listDealerApplications(
            status,
            page,
            limit,
        );

        response.status(200).json({
            success: true,
            data: result,
        });
    } catch (error: unknown) {
        console.error(
            "[ADMIN DEALERS] Failed to list dealer applications.",
            error,
        );

        response.status(500).json({
            success: false,
            message: "Unable to retrieve dealer applications.",
        });
    }
}

export async function dealerApplicationHistory(
    request: Request,
    response: Response,
): Promise<void> {
    try {
        const statusQuery = request.query.status;

        if (
            statusQuery !== undefined &&
            statusQuery !== "APPROVED" &&
            statusQuery !== "REJECTED"
        ) {
            response.status(400).json({
                success: false,
                message:
                    "History status must be APPROVED or REJECTED.",
            });

            return;
        }

        const status =
            statusQuery === "APPROVED" ||
            statusQuery === "REJECTED"
                ? statusQuery
                : undefined;

        const page = Number(request.query.page ?? 1);
        const limit = Number(request.query.limit ?? 20);

        if (
            !Number.isInteger(page) ||
            page < 1 ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 100
        ) {
            response.status(400).json({
                success: false,
                message: "Invalid pagination parameters.",
            });

            return;
        }

        const result =
            await listDealerApplicationHistory(
                status,
                page,
                limit,
            );

        response.status(200).json({
            success: true,
            data: result,
        });
    } catch (error: unknown) {
        console.error(
            "[ADMIN DEALERS] Failed to retrieve application history.",
            error,
        );

        response.status(500).json({
            success: false,
            message:
                "Unable to retrieve dealer application history.",
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

/* =========================================================
   ADMIN DEALER DOCUMENT PREVIEW
========================================================= */

export async function previewDealerDocument(
    request: Request,
    response: Response,
): Promise<void> {
    try {
        const documentId = request.params.documentId;

        if (
            typeof documentId !== "string" ||
            !documentId.trim()
        ) {
            response.status(400).json({
                success: false,
                message: "A valid document ID is required.",
            });
            return;
        }

        const document =
            await getAdminDealerDocumentSignedUrl(documentId);

        response.status(200).json({
            success: true,
            data: {
                document,
            },
        });
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Unable to generate the document preview.";

        const notFound =
            message === "Dealer verification document not found.";

        const invalidId =
            message === "Invalid dealer document ID.";

        response.status(
            notFound ? 404 : invalidId ? 400 : 500,
        ).json({
            success: false,
            message,
        });
    }
}