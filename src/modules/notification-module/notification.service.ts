import {
    and,
    desc,
    eq,
    sql,
} from "drizzle-orm";

import { db } from "../../database/index.ts";
import {
    notificationPreferences,
    notifications,
    notificationTypeEnum,
    users,
} from "../../database/schema/index.ts";
import { getSocketIO } from "../../realtime/socket.ts";
import { sendNotificationEmail } from "../email-module/email.service.ts";

export type NotificationType =
    (typeof notificationTypeEnum.enumValues)[number];

export interface CreateNotificationInput {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    data?: Record<string, unknown>;
    idempotencykey?: string;
}

function emitRealtimeNotification(
    userId: string,
    notification: typeof notifications.$inferSelect,
): void {
    // Socket.IO is optional for HTTP operations, so a server without an initialized socket should not fail a notification insert.
    try {
        getSocketIO()
            .to(`user:${userId}`)
            .emit("notification:new", notification);
    } catch {
        // The notification is already persisted and can be fetched through REST.
    }
}

export async function createNotification(
    input: CreateNotificationInput,
) {
    const preference = await db
        .select()
        .from(notificationPreferences)
        .where(
            eq(
                notificationPreferences.userId,
                input.userId,
            ),
        )
        .limit(1);

    const inserted = await db
        .insert(notifications)
        .values({
            userId: input.userId,
            type: input.type,
            title: input.title,
            message: input.message,
            ...(input.data !== undefined
                ? { data: input.data }
                : {}),
            ...(input.idempotencykey !== undefined
                ? { idempotencyKey: input.idempotencykey }
                : {}),
        })
        .onConflictDoNothing({
            target: notifications.idempotencyKey,
        })
        .returning();

    const notification = inserted[0];

    if (!notification) {
        if (input.idempotencykey !== undefined) {
            const existing = await db
                .select()
                .from(notifications)
                .where(
                    eq(
                        notifications.idempotencyKey,
                        input.idempotencykey,
                    ),
                )
                .limit(1);

            if (existing[0]) {
                return existing[0];
            }
        }

        throw new Error("Unable to create notification.");
    }

    // Persist first; in-app preference controls realtime delivery, not notification history.
    if (preference[0]?.inAppEnabled !== false) {
        emitRealtimeNotification(
            input.userId,
            notification,
        );
    }

    // Email is a secondary channel. SMTP failures are isolated so they never prevent in-app notifications.
    if (preference[0]?.emailEnabled !== false) {
        const user = await db
            .select({
                email: users.email,
                firstName: users.firstName,
            })
            .from(users)
            .where(eq(users.id, input.userId))
            .limit(1);

        if (user[0]) {
            try {
                await sendNotificationEmail({
                    email: user[0].email,
                    firstName: user[0].firstName,
                    title: input.title,
                    message: input.message,
                });
            } catch {
                // Email delivery is best-effort; the persistent in-app notification remains available.
            }
        }
    }

    return notification;
}

export async function listNotifications(
    userId: string,
    limit = 30,
    offset = 0,
) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safeOffset = Math.max(offset, 0);

    return db
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(safeLimit)
        .offset(safeOffset);
}

export async function getUnreadNotificationCount(
    userId: string,
): Promise<number> {
    const result = await db
        .select({
            count: sql<number>`COUNT(*)`,
        })
        .from(notifications)
        .where(
            and(
                eq(notifications.userId, userId),
                eq(notifications.read, false),
            ),
        );

    return Number(result[0]?.count ?? 0);
}

export async function markNotificationRead(
    userId: string,
    notificationId: string,
) {
    const result = await db
        .update(notifications)
        .set({
            read: true,
            readAt: new Date(),
        })
        .where(
            and(
                eq(notifications.id, notificationId),
                eq(notifications.userId, userId),
            ),
        )
        .returning();

    return result[0] ?? null;
}

export async function markAllNotificationsRead(
    userId: string,
): Promise<number> {
    const result = await db
        .update(notifications)
        .set({
            read: true,
            readAt: new Date(),
        })
        .where(
            and(
                eq(notifications.userId, userId),
                eq(notifications.read, false),
            ),
        )
        .returning({ id: notifications.id });

    return result.length;
}

export async function getNotificationPreferences(
    userId: string,
) {
    const result = await db
        .select()
        .from(notificationPreferences)
        .where(
            eq(
                notificationPreferences.userId,
                userId,
            ),
        )
        .limit(1);

    if (result[0]) {
        return result[0];
    }

    const created = await db
        .insert(notificationPreferences)
        .values({ userId })
        .returning();

    return created[0];
}

export async function updateNotificationPreferences(
    userId: string,
    input: {
        inAppEnabled?: boolean;
        emailEnabled?: boolean;
    },
) {
    // Upsert keeps the endpoint safe for first-time users and existing users.
    const existing = await getNotificationPreferences(userId);

    const updated = await db
        .update(notificationPreferences)
        .set({
            ...(input.inAppEnabled !== undefined
                ? { inAppEnabled: input.inAppEnabled }
                : {}),
            ...(input.emailEnabled !== undefined
                ? { emailEnabled: input.emailEnabled }
                : {}),
            updatedAt: new Date(),
        })
        .where(
            eq(
                notificationPreferences.id,
                existing!.id,
            ),
        )
        .returning();

    return updated[0];
}
