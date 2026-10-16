import type {
    Request,
    Response,
} from "express";

import { ZodError } from "zod";

import {
    AppError,
} from "../../../errors/app-error.ts";

import {
    logger,
} from "../../../config/logger.ts";

import {
    getAdminCommercialSettings,
    getAdminSettingsByCategory,
    getAdminSettingsOverview,
    updateAdminCommercialSettings,
} from "./admin-settings.service.ts";

import {
    settingsCategorySchema,
    settingsHistoryQuerySchema,
    updateCommercialSettingsSchema,
} from "./admin-settings.validation.ts";
import { getAdminSettingsHistory } from "./admin-settings-history.service.ts";

function getAdminId(
    request: Request,
): string {
    const admin = request.admin;

    if (!admin) {
        throw new AppError(
            "Administrator authentication required.",
            401,
            "ADMIN_AUTH_REQUIRED",
        );
    }

    return admin.id;
}

export async function getCommercialSettingsController(
    request: Request,
    response: Response,
): Promise<void> {
    try {
        getAdminId(request);

        const result =
            await getAdminCommercialSettings();

        response.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        logger.error(
            { err: error },
            "Unable to retrieve commercial settings.",
        );

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
            message:
                "Unable to retrieve commercial settings.",
        });
    }
}

export async function updateCommercialSettingsController(
    request: Request,
    response: Response,
): Promise<void> {
    try {
        const adminId = getAdminId(request);

        const input =
            updateCommercialSettingsSchema.parse(
                request.body,
            );

        const result =
            await updateAdminCommercialSettings(
                adminId,
                input,
            );

        response.status(200).json({
            success: true,
            data: result,
        });
    } catch (error) {
        if (error instanceof ZodError) {
            response.status(400).json({
                success: false,
                message:
                    "Invalid commercial settings.",
                errors: error.issues.map((issue) => ({
                    field: issue.path.join("."),
                    message: issue.message,
                })),
            });

            return;
        }

        if (error instanceof AppError) {
            response.status(error.statusCode).json({
                success: false,
                message: error.message,
                code: error.code,
            });

            return;
        }

        logger.error(
            { err: error },
            "Unable to update commercial settings.",
        );

        response.status(500).json({
            success: false,
            message:
                "Unable to update commercial settings.",
        });
    }
}

export async function getSettingsOverviewController(
    request: Request,
    response: Response,
): Promise<void> {
    try {
        getAdminId(request);

        const result = await getAdminSettingsOverview();

        response.status(200).json({
            success: true,
            data: {
                settings: result,
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

        logger.error(
            { err: error },
            "Unable to retrieve settings overview.",
        );

        response.status(500).json({
            success: false,
            message: "Unable to retrieve settings.",
        });
    }
}

export async function getSettingsByCategoryController(
    request: Request,
    response: Response,
): Promise<void> {
    try {
        getAdminId(request);

        const parsedCategory =
            settingsCategorySchema.safeParse(
                request.params.category,
            );

        if (!parsedCategory.success) {
            response.status(400).json({
                success: false,
                message: "Invalid settings category.",
                allowedCategories: [
                    "COMMERCIAL",
                    "LISTINGS",
                ],
            });
            return;
        }

        const settings =
            await getAdminSettingsByCategory(
                parsedCategory.data,
            );

        response.status(200).json({
            success: true,
            data: settings,
        });
    } catch (error: unknown) {
        if (error instanceof AppError) {
            response.status(error.statusCode).json({
                success: false,
                message: error.message,
                code: error.code,
            });
            return;
        }

        logger.error(
            { err: error },
            "Failed to retrieve settings by category.",
        );

        response.status(500).json({
            success: false,
            message: "Unable to retrieve settings.",
        });
    }
}

export async function getSettingsHistoryController(
    request: Request,
    response: Response,
): Promise<void> {
    try {
        getAdminId(request);

        const parsed =
            settingsHistoryQuerySchema.safeParse(
                request.query,
            );

        if (!parsed.success) {
            response.status(400).json({
                success: false,
                message: "Invalid pagination parameters.",
                errors: parsed.error.issues.map((issue) => ({
                    field: issue.path.join("."),
                    message: issue.message,
                })),
            });
            return;
        }

        const result = await getAdminSettingsHistory(
            parsed.data,
        );

        response.status(200).json({
            success: true,
            data: result,
        });
    } catch (error: unknown) {
        if (error instanceof AppError) {
            response.status(error.statusCode).json({
                success: false,
                message: error.message,
                code: error.code,
            });
            return;
        }

        logger.error(
            { err: error },
            "Failed to retrieve admin settings history.",
        );

        response.status(500).json({
            success: false,
            message: "Unable to retrieve settings history.",
        });
    }
}