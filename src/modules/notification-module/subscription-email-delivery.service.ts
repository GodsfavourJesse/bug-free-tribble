import { db } from "../../database/index.ts";

import {
    notificationDeliveryJobs,
} from "../../database/schema/index.ts";

/*
 * ============================================================
 * TYPES
 * ============================================================
 */

type DatabaseTransaction = Parameters<
    Parameters<typeof db.transaction>[0]
>[0];

export type SubscriptionActivatedEmailPayload = Record<string, unknown> & {
    kind: "SUBSCRIPTION_ACTIVATED";
    userId: string;
    subscriptionId: string;
    paymentId: string;
};

export type SubscriptionExpiryReminderEmailPayload = Record<string, unknown> & {
    kind: "SUBSCRIPTION_EXPIRY_REMINDER";
    userId: string;
    subscriptionId: string;
    expiresAt: string;
};

export type SubscriptionEmailPayload =
    | SubscriptionActivatedEmailPayload
    | SubscriptionExpiryReminderEmailPayload;

/*
 * ============================================================
 * CONFIGURATION
 * ============================================================
 */

const SUBSCRIPTION_REMINDER_DAYS = 3;
const MAX_EMAIL_ATTEMPTS = 5;

/*
 * ============================================================
 * REMINDER SCHEDULING
 * ============================================================
 *
 * Schedule the reminder three days before expiration.
 *
 * If the subscription is already within its final three days
 * when activated, make the job available immediately.
 */

function getReminderAvailableAt(expiresAt: Date): Date {
    const reminderDate = new Date(expiresAt);

    reminderDate.setUTCDate(
        reminderDate.getUTCDate() - SUBSCRIPTION_REMINDER_DAYS,
    );

    const now = new Date();

    return reminderDate > now ? reminderDate : now;
}

/*
 * ============================================================
 * ACTIVATION EMAIL
 * ============================================================
 *
 * This job is created inside the payment fulfillment transaction.
 *
 * It is delivered asynchronously by the notification worker.
 */

export async function enqueueSubscriptionActivatedEmail(
    tx: DatabaseTransaction,
    input: {
        userId: string;
        subscriptionId: string;
        paymentId: string;
    },
): Promise<void> {
    const payload: SubscriptionActivatedEmailPayload = {
        kind: "SUBSCRIPTION_ACTIVATED",
        userId: input.userId,
        subscriptionId: input.subscriptionId,
        paymentId: input.paymentId,
    };

    await tx
        .insert(notificationDeliveryJobs)
        .values({
            userId: input.userId,
            channel: "EMAIL",

            idempotencyKey:
                `subscription:${input.subscriptionId}:activated:${input.paymentId}:email`,

            payload,

            status: "PENDING",
            attempts: 0,
            maxAttempts: MAX_EMAIL_ATTEMPTS,
            availableAt: new Date(),
        })
        .onConflictDoNothing({
            target: notificationDeliveryJobs.idempotencyKey,
        });
}

/*
 * ============================================================
 * EXPIRY REMINDER EMAIL
 * ============================================================
 *
 * Schedules a reminder three days before subscription expiry.
 *
 * The worker must revalidate the subscription before sending.
 */

export async function enqueueSubscriptionExpiryReminderEmail(
    tx: DatabaseTransaction,
    input: {
        userId: string;
        subscriptionId: string;
        expiresAt: Date;
    },
): Promise<void> {
    if (
        !(input.expiresAt instanceof Date) ||
        Number.isNaN(input.expiresAt.getTime())
    ) {
        throw new Error(
            "A valid subscription expiry date is required.",
        );
    }

    const payload: SubscriptionExpiryReminderEmailPayload = {
        kind: "SUBSCRIPTION_EXPIRY_REMINDER",
        userId: input.userId,
        subscriptionId: input.subscriptionId,
        expiresAt: input.expiresAt.toISOString(),
    };

    await tx
        .insert(notificationDeliveryJobs)
        .values({
            userId: input.userId,
            channel: "EMAIL",

            idempotencyKey:
                `subscription:${input.subscriptionId}:expiry-reminder:${input.expiresAt.getTime()}:email`,

            payload,

            status: "PENDING",
            attempts: 0,
            maxAttempts: MAX_EMAIL_ATTEMPTS,
            availableAt: getReminderAvailableAt(input.expiresAt),
        })
        .onConflictDoNothing({
            target: notificationDeliveryJobs.idempotencyKey,
        });
}