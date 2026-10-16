import type {
    Request,
    Response,
} from "express";

import {
    applyAsDealer,
    deleteDealerDocument,
    getDealerDocumentSignedUrl,
    getDealerDocuments,
    uploadDealerDocument,
} from "./dealer.service.ts";
import { getPublicDealerListings, getPublicDealerProfile } from "./dealer-public/dealer-public.service.ts";
import { getDealerAnalytics } from "./dealer-analytics/dealer-analytics.service.ts";
import { AppError } from "../../errors/app-error.ts";

function getRouteParam(
    value: string | string[] | undefined,
): string | undefined {
    if (typeof value === "string") {
        return value;
    }

    return undefined;
}

export async function apply(
    request: Request,
    response: Response,
): Promise<void> {
    if (!request.user) {
        response.status(401).json({
            success: false,
            message:
                "Authentication required.",
        });

        return;
    }

    const {
        companyName,
        registrationNumber,
        businessAddress,
    } = request.body;

    if (
        typeof companyName !==
        "string"
    ) {
        response.status(400).json({
            success: false,
            message:
                "companyName is required.",
        });

        return;
    }

    try {
        const application =
            await applyAsDealer(
                request.user.id,
                {
                    companyName,

                    ...(typeof registrationNumber ===
                    "string"
                        ? {
                              registrationNumber,
                          }
                        : {}),

                    ...(typeof businessAddress ===
                    "string"
                        ? {
                              businessAddress,
                          }
                        : {}),
                },
            );

        response.status(201).json({
            success: true,
            data: {
                application,
            },
        });
    } catch (error) {
        response.status(400).json({
            success: false,
            message:
                error instanceof Error
                    ? error.message
                    : "Dealer application failed.",
        });
    }
}

export async function uploadDocument(
    request: Request,
    response: Response,
): Promise<void> {
    if (!request.user) {
        response.status(401).json({
            success: false,
            message:
                "Authentication required.",
        });

        return;
    }

    const applicationId =
        getRouteParam(
            request.params.applicationId,
        );

    if (!applicationId) {
        response.status(400).json({
            success: false,
            message:
                "applicationId is required.",
        });

        return;
    }

    if (!request.file) {
        response.status(400).json({
            success: false,
            message:
                "A dealer document file is required.",
        });

        return;
    }

    const documentType =
        request.body.documentType;

    if (
        typeof documentType !==
        "string"
    ) {
        response.status(400).json({
            success: false,
            message:
                "documentType is required.",
        });

        return;
    }

    try {
        const document =
            await uploadDealerDocument(
                request.user.id,
                applicationId,
                documentType,
                request.file,
            );

        response.status(201).json({
            success: true,
            data: {
                document,
            },
        });
    } catch (error) {
        response.status(400).json({
            success: false,
            message:
                error instanceof Error
                    ? error.message
                    : "Dealer document upload failed.",
        });
    }
}

export async function listDocuments(
    request: Request,
    response: Response,
): Promise<void> {
    if (!request.user) {
        response.status(401).json({
            success: false,
            message:
                "Authentication required.",
        });

        return;
    }

    const applicationId =
        getRouteParam(
            request.params.applicationId,
        );

    if (!applicationId) {
        response.status(400).json({
            success: false,
            message:
                "applicationId is required.",
        });

        return;
    }

    try {
        const documents =
            await getDealerDocuments(
                request.user.id,
                applicationId,
            );

        response.status(200).json({
            success: true,
            data: {
                documents,
            },
        });
    } catch (error) {
        response.status(404).json({
            success: false,
            message:
                error instanceof Error
                    ? error.message
                    : "Unable to retrieve dealer documents.",
        });
    }
}

export async function getDocumentUrl(
    request: Request,
    response: Response,
): Promise<void> {
    if (!request.user) {
        response.status(401).json({
            success: false,
            message:
                "Authentication required.",
        });

        return;
    }

    const documentId =
        getRouteParam(
            request.params.documentId,
        );

    if (!documentId) {
        response.status(400).json({
            success: false,
            message:
                "documentId is required.",
        });

        return;
    }

    try {
        const document =
            await getDealerDocumentSignedUrl(
                request.user.id,
                documentId,
            );

        response.status(200).json({
            success: true,
            data: {
                document,
            },
        });
    } catch (error) {
        response.status(404).json({
            success: false,
            message:
                error instanceof Error
                    ? error.message
                    : "Unable to generate document URL.",
        });
    }
}

export async function removeDocument(
    request: Request,
    response: Response,
): Promise<void> {
    if (!request.user) {
        response.status(401).json({
            success: false,
            message:
                "Authentication required.",
        });

        return;
    }

    const documentId =
        getRouteParam(
            request.params.documentId,
        );

    if (!documentId) {
        response.status(400).json({
            success: false,
            message:
                "documentId is required.",
        });

        return;
    }

    try {
        const result =
            await deleteDealerDocument(
                request.user.id,
                documentId,
            );

        response.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        response.status(400).json({
            success: false,
            message:
                error instanceof Error
                    ? error.message
                    : "Unable to delete dealer document.",
        });
    }
}

export async function getPublicProfile(
    request: Request,
    response: Response,
): Promise<void> {
    const dealerId = getRouteParam(
        request.params.dealerId,
    );

    if (!dealerId) {
        response.status(400).json({
            success: false,
            message: "dealerId is required.",
        });

        return;
    }

    try {
        const profile = await getPublicDealerProfile(
            dealerId,
        );

        if (!profile) {
            response.status(404).json({
                success: false,
                message: "Dealer not found.",
            });

            return;
        }

        response.status(200).json({
            success: true,
            data: {
                dealer: profile,
            },
        });
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Unable to retrieve dealer profile.";

        const isInvalidId =
            message === "Invalid dealer ID.";

        response.status(isInvalidId ? 400 : 500).json({
            success: false,
            message: isInvalidId
                ? message
                : "Unable to retrieve dealer profile.",
        });
    }
}

export async function getPublicListings(
    request: Request,
    response: Response,
): Promise<void> {
    const dealerId = getRouteParam(
        request.params.dealerId,
    );

    if (!dealerId) {
        response.status(400).json({
            success: false,
            message: "dealerId is required.",
        });

        return;
    }

    const rawPage = request.query.page;
    const rawLimit = request.query.limit;

    const page =
        rawPage === undefined
            ? 1
            : Number(rawPage);

    const limit =
        rawLimit === undefined
            ? 20
            : Number(rawLimit);

    if (
        typeof rawPage === "object" ||
        typeof rawLimit === "object" ||
        !Number.isSafeInteger(page) ||
        page < 1 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 100
    ) {
        response.status(400).json({
            success: false,
            message:
                "page must be a positive integer, and limit must be between 1 and 100.",
        });

        return;
    }

    try {
        const result = await getPublicDealerListings(
            dealerId,
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
        const message =
            error instanceof Error
                ? error.message
                : "Unable to retrieve dealer listings.";

        const isInvalidId =
            message === "Invalid dealer ID.";

        response.status(isInvalidId ? 400 : 500).json({
            success: false,
            message: isInvalidId
                ? message
                : "Unable to retrieve dealer listings.",
        });
    }
}

export async function getMyAnalytics(
    request: Request,
    response: Response,
): Promise<void> {
    if (!request.user) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });

        return;
    }

    try {
        const analytics = await getDealerAnalytics(
            request.user.id,
        );

        response.status(200).json({
            success: true,
            data: {
                analytics,
            },
        });
    } catch (error) {
        if (error instanceof AppError) {
            response.status(error.statusCode).json({
                success: false,
                message: error.message,
                code: error.code,
            });

            return;
        }

        response.status(500).json({
            success: false,
            message: "Unable to retrieve dealer analytics.",
        });
    }
}