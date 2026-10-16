import {
    notificationTypeEnum,
} from "../../database/schema/index.ts";

import type {
    ClaimedJob,
} from "./job.queue.ts";

import {
    createNotification,
} from "../../modules/notification-module/notification.service.ts";

const NOTIFICATION_TYPES = notificationTypeEnum.enumValues;

interface NotificationJobPayload {
    userId: string;
    type: (typeof NOTIFICATION_TYPES)[number];
    title: string;
    message: string;
    idempotencyKey: string;
    data?: Record<string, unknown>;
}

function isRecord(
    value: unknown,
): value is Record<string, unknown> {
    return (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
    );
}

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
    );
}

function parseNotificationPayload(
    payload: Record<string, unknown>,
): NotificationJobPayload {
    const {
        userId,
        type,
        title,
        message,
        idempotencyKey,
        data,
    } = payload;

    if (
        typeof userId !== "string" ||
        !isUuid(userId)
    ) {
        throw new Error(
            "Notification job requires a valid userId UUID.",
        );
    }

    if (
        typeof type !== "string" ||
        !NOTIFICATION_TYPES.includes(
            type as (typeof NOTIFICATION_TYPES)[number],
        )
    ) {
        throw new Error(
            "Notification job contains an unsupported notification type.",
        );
    }

    if (
        typeof title !== "string" ||
        title.trim().length === 0 ||
        title.length > 200
    ) {
        throw new Error(
            "Notification title must contain between 1 and 200 characters.",
        );
    }

    if (
        typeof message !== "string" ||
        message.trim().length === 0 ||
        message.length > 1000
    ) {
        throw new Error(
            "Notification message must contain between 1 and 1000 characters.",
        );
    }

    if (
        typeof idempotencyKey !== "string" ||
        idempotencyKey.trim().length === 0 ||
        idempotencyKey.length > 255
    ) {
        throw new Error(
            "Notification job requires a valid idempotencyKey.",
        );
    }

    if (
        data !== undefined &&
        !isRecord(data)
    ) {
        throw new Error(
            "Notification data must be an object when provided.",
        );
    }

    return {
        userId,
        type: type as NotificationJobPayload["type"],
        title,
        message,
        idempotencyKey,
        ...(data !== undefined
            ? { data }
            : {}),
    };
}

export async function handleNotificationJob(
    job: ClaimedJob,
): Promise<void> {
    if (job.type !== "NOTIFICATION_DISPATCH") {
        throw new Error(
            `Notification handler cannot process "${job.type}" jobs.`,
        );
    }

    const payload = parseNotificationPayload(
        job.payload,
    );

    await createNotification({
        userId: payload.userId,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        idempotencykey: payload.idempotencyKey,
        ...(payload.data !== undefined
            ? { data: payload.data }
            : {}),
    });
}