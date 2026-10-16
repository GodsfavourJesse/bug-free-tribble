import type { NextFunction, Request, Response } from "express";

import { z } from "zod";

import {
    getUnreadNotificationCount,
    listNotifications,
    markAllNotificationsRead,
    markNotificationRead,
} from "../../notification-module/notification.service.ts";

import { notificationListSchema } from "../../notification-module/notification.validation.ts";

const notificationIdSchema = z.object({
    notificationId: z.string().uuid(),
});

function getAdminId(request: Request): string {
    const adminId = request.admin?.id;

    if (!adminId) {
        throw new Error("Administrator authentication required.");
    }

    return adminId;
}

export async function listAdminNotifications(
    request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const adminId = getAdminId(request);
        const query = notificationListSchema.parse(request.query);

        const [notifications, unreadCount] = await Promise.all([
            listNotifications(adminId, query.limit, query.offset),
            getUnreadNotificationCount(adminId),
        ]);

        response.status(200).json({
            success: true,
            data: { notifications, unreadCount },
        });
    } catch (error) {
        next(error);
    }
}

export async function getAdminUnreadCount(
    request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const unreadCount = await getUnreadNotificationCount(
            getAdminId(request),
        );

        response.status(200).json({
            success: true,
            data: { unreadCount },
        });
    } catch (error) {
        next(error);
    }
}

export async function markAdminNotificationRead(
    request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const { notificationId } = notificationIdSchema.parse(
            request.params,
        );

        const notification = await markNotificationRead(
            getAdminId(request),
            notificationId,
        );

        if (!notification) {
            response.status(404).json({
                success: false,
                message: "Notification not found.",
            });

            return;
        }

        response.status(200).json({
            success: true,
            data: { notification },
        });
    } catch (error) {
        next(error);
    }
}

export async function markAllAdminNotificationsRead(
    request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const markedRead = await markAllNotificationsRead(
            getAdminId(request),
        );

        response.status(200).json({
            success: true,
            data: { markedRead },
        });
    } catch (error) {
        next(error);
    }
}