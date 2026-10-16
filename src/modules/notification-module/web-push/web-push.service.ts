import webPush from "web-push";

import { and, eq } from "drizzle-orm";

import { env } from "../../../config/env.ts";
import { db } from "../../../database/index.ts";

import {
    pushSubscriptions,
} from "../../../database/schema/index.ts";

interface PushSubscriptionKeys {
    p256dh: string;
    auth: string;
}

interface StoredPushSubscription {
    id: string;
    userId: string;
    endpoint: string;
    keys: unknown;
}

export interface WebPushNotification {
    title: string;
    body: string;
    notificationId?: string;
    url?: string;
    tag?: string;
    data?: Record<string, unknown>;
}

export interface WebPushDeliveryResult {
    subscriptionId: string;
    delivered: boolean;
    permanentlyInvalid: boolean;
    statusCode?: number;
    error?: string;
}

let vapidConfigured = false;

function configureVapid(): boolean {
    if (vapidConfigured) {
        return true;
    }

    const publicKey = env.VAPID_PUBLIC_KEY;
    const privateKey = env.VAPID_PRIVATE_KEY;

    if (!publicKey || !privateKey) {
        return false;
    }

    webPush.setVapidDetails(
        env.VAPID_SUBJECT,
        publicKey,
        privateKey,
    );

    vapidConfigured = true;

    return true;
}

function parseSubscriptionKeys(
    value: unknown,
): PushSubscriptionKeys {
    if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
    ) {
        throw new Error(
            "Stored push subscription keys are invalid.",
        );
    }

    const keys = value as Record<string, unknown>;

    if (
        typeof keys.p256dh !== "string" ||
        keys.p256dh.length === 0 ||
        typeof keys.auth !== "string" ||
        keys.auth.length === 0
    ) {
        throw new Error(
            "Push subscription must contain p256dh and auth keys.",
        );
    }

    return {
        p256dh: keys.p256dh,
        auth: keys.auth,
    };
}

function getErrorStatusCode(
    error: unknown,
): number | undefined {
    if (
        typeof error !== "object" ||
        error === null ||
        !("statusCode" in error)
    ) {
        return undefined;
    }

    const statusCode = error.statusCode;

    return typeof statusCode === "number"
        ? statusCode
        : undefined;
}

function getErrorMessage(
    error: unknown,
): string {
    return (
        error instanceof Error
            ? error.message
            : "Unknown Web Push delivery error."
    ).slice(0, 1000);
}

function isPermanentlyInvalid(
    statusCode: number | undefined,
): boolean {
    // 404: subscription endpoint no longer exists.
    // 410: subscription has expired or been revoked.
    return statusCode === 404 || statusCode === 410;
}

async function deactivateSubscription(
    subscriptionId: string,
): Promise<void> {
    await db
        .update(pushSubscriptions)
        .set({
            active: false,
            updatedAt: new Date(),
        })
        .where(
            eq(
                pushSubscriptions.id,
                subscriptionId,
            ),
        );
}

/**
 * Send a Web Push notification to one subscription.
 *
 * A 404 or 410 response means the endpoint is no longer valid.
 * Other errors are returned to the caller so the queue can retry.
 */
export async function sendWebPushToSubscription(
    subscription: StoredPushSubscription,
    notification: WebPushNotification,
): Promise<WebPushDeliveryResult> {
    if (!configureVapid()) {
        throw new Error(
            "Web Push is not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.",
        );
    }

    const keys = parseSubscriptionKeys(
        subscription.keys,
    );

    const payload = JSON.stringify({
        title: notification.title,
        body: notification.body,
        ...(notification.notificationId
            ? {
                notificationId:
                    notification.notificationId,
            }
            : {}),
        ...(notification.url
            ? {
                url: notification.url,
            }
            : {}),
        ...(notification.tag
            ? {
                tag: notification.tag,
            }
            : {}),
        ...(notification.data
            ? {
                data: notification.data,
            }
            : {}),
    });

    try {
        const response = await webPush.sendNotification(
            {
                endpoint: subscription.endpoint,
                keys,
            },
            payload,
            {
                TTL: 60 * 60,
                urgency: "high",
            },
        );

        return {
            subscriptionId: subscription.id,
            delivered: true,
            permanentlyInvalid: false,
            statusCode: response.statusCode,
        };
    } catch (error) {
        const statusCode = getErrorStatusCode(error);
        const permanentlyInvalid =
            isPermanentlyInvalid(statusCode);

        if (permanentlyInvalid) {
            await deactivateSubscription(
                subscription.id,
            );
        }

        return {
            subscriptionId: subscription.id,
            delivered: false,
            permanentlyInvalid,
            ...(statusCode !== undefined
                ? { statusCode }
                : {}),
            error: getErrorMessage(error),
        };
    }
}

/**
 * Send a notification to every active subscription for a user.
 *
 * Invalid subscriptions are deactivated individually.
 * Temporary failures are returned so the queue can retry.
 */
export async function sendWebPushToUser(
    userId: string,
    notification: WebPushNotification,
): Promise<WebPushDeliveryResult[]> {
    if (!configureVapid()) {
        throw new Error(
            "Web Push is not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.",
        );
    }

    const subscriptions = await db
        .select({
            id: pushSubscriptions.id,
            userId: pushSubscriptions.userId,
            endpoint: pushSubscriptions.endpoint,
            keys: pushSubscriptions.keys,
        })
        .from(pushSubscriptions)
        .where(
            and(
                eq(pushSubscriptions.userId, userId),
                eq(pushSubscriptions.active, true),
            ),
        );

    const results: WebPushDeliveryResult[] = [];

    for (const subscription of subscriptions) {
        const result = await sendWebPushToSubscription(
            subscription,
            notification,
        );

        results.push(result);
    }

    return results;
}

/**
 * Check whether Web Push has been configured.
 */
export function isWebPushConfigured(): boolean {
    return Boolean(
        env.VAPID_PUBLIC_KEY &&
        env.VAPID_PRIVATE_KEY,
    );
}
