import type {
    Request,
    Response,
} from "express";

import { ZodError } from "zod";

import {
    getNotificationPreferences,
    getUnreadNotificationCount,
    listNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    updateNotificationPreferences,
} from "./notification.service.ts";

import {
    notificationListSchema,
    notificationPreferencesSchema,
} from "./notification.validation.ts";

export async function list(
    request: Request,
    response: Response,
): Promise<void> {
    const user = request.user;

    if (!user) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });

        return;
    }

    try {
        const query =
            notificationListSchema.parse(
                request.query,
            );

        const [
            notifications,
            unreadCount,
        ] = await Promise.all([
            listNotifications(
                user.id,
                query.limit,
                query.offset,
            ),
            getUnreadNotificationCount(
                user.id,
            ),
        ]);

        response.json({
            success: true,
            data: {
                notifications,
                unreadCount,
            },
        });
    } catch (error) {
        if (error instanceof ZodError) {
            response.status(400).json({
                success: false,
                message: "Invalid notification query.",
                errors: error.issues,
            });

            return;
        }

        throw error;
    }
}

export async function unreadCount(
    request: Request,
    response: Response,
): Promise<void> {
    const user = request.user;

    if (!user) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });

        return;
    }

    const count =
        await getUnreadNotificationCount(
            user.id,
        );

    response.json({
        success: true,
        data: {
            unreadCount: count,
        },
    });
}

export async function markRead(
    request: Request,
    response: Response,
): Promise<void> {
    const user = request.user;

    if (!user) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });

        return;
    }

    const notificationId =
        request.params.notificationId;

    if (
        typeof notificationId !== "string" ||
        !notificationId
    ) {
        response.status(400).json({
            success: false,
            message: "notificationId is required.",
        });

        return;
    }

    const notification =
        await markNotificationRead(
            user.id,
            notificationId,
        );

    if (!notification) {
        response.status(404).json({
            success: false,
            message: "Notification not found.",
        });

        return;
    }

    response.json({
        success: true,
        data: {
            notification,
        },
    });
}

export async function markAllRead(
    request: Request,
    response: Response,
): Promise<void> {
    const user = request.user;

    if (!user) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });

        return;
    }

    const count =
        await markAllNotificationsRead(
            user.id,
        );

    response.json({
        success: true,
        data: {
            markedRead: count,
        },
    });
}

export async function preferences(
    request: Request,
    response: Response,
): Promise<void> {
    const user = request.user;

    if (!user) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });

        return;
    }

    try {
        const parsed =
            notificationPreferencesSchema.parse(
                request.body,
            );

        // Omit optional properties when undefined.
        const input = {
            ...(parsed.inAppEnabled !== undefined
                ? {
                      inAppEnabled:
                          parsed.inAppEnabled,
                  }
                : {}),

            ...(parsed.emailEnabled !== undefined
                ? {
                      emailEnabled:
                          parsed.emailEnabled,
                  }
                : {}),
        };

        const result =
            await updateNotificationPreferences(
                user.id,
                input,
            );

        response.json({
            success: true,
            data: {
                preferences: result,
            },
        });
    } catch (error) {
        if (error instanceof ZodError) {
            response.status(400).json({
                success: false,
                message:
                    "Invalid notification preferences.",
                errors: error.issues,
            });

            return;
        }

        throw error;
    }
}

export async function getPreferences(
    request: Request,
    response: Response,
): Promise<void> {
    const user = request.user;

    if (!user) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });

        return;
    }

    const result =
        await getNotificationPreferences(
            user.id,
        );

    response.json({
        success: true,
        data: {
            preferences: result,
        },
    });
}