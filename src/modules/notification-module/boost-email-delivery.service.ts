import { db } from "../../database/index.ts";

import {
    notificationDeliveryJobs,
} from "../../database/schema/index.ts";

type DatabaseTransaction = Parameters<
    Parameters<typeof db.transaction>[0]
>[0];

const MAX_EMAIL_ATTEMPTS = 5;

const BOOST_REMINDER_HOURS = 24;

export interface AdminBoostPaymentEmailPayload
    extends Record<string, unknown> {
    kind: "ADMIN_BOOST_PAYMENT_RECEIVED";
    userId: string;
    listingBoostId: string;
    paymentId: string;
}

export interface BoostExpiryReminderEmailPayload
    extends Record<string, unknown> {
    kind: "BOOST_EXPIRY_REMINDER";
    userId: string;
    listingBoostId: string;
    listingId: string;
    expiresAt: string;
}

export type BoostEmailPayload =
    | AdminBoostPaymentEmailPayload
    | BoostExpiryReminderEmailPayload;

/**
 * Calculate when the 24-hour reminder should become available.
 *
 * If the boost is already within its final 24 hours,
 * make the reminder available immediately.
 */
function getBoostReminderAvailableAt(
    expiresAt: Date,
): Date {
    const reminderDate = new Date(
        expiresAt.getTime() -
        BOOST_REMINDER_HOURS * 60 * 60 * 1000,
    );

    const now = new Date();

    return reminderDate > now
        ? reminderDate
        : now;
}

/**
 * Queue an administrator email when a boost payment
 * has been successfully verified.
 *
 * Must be called inside the payment transaction.
 */
export async function enqueueAdminBoostPaymentEmail(
    tx: DatabaseTransaction,
    input: {
        adminUserId: string;
        listingBoostId: string;
        paymentId: string;
    },
): Promise<void> {
    const payload: AdminBoostPaymentEmailPayload = {
        kind: "ADMIN_BOOST_PAYMENT_RECEIVED",
        userId: input.adminUserId,
        listingBoostId: input.listingBoostId,
        paymentId: input.paymentId,
    };

    await tx
        .insert(notificationDeliveryJobs)
        .values({
            userId: input.adminUserId,
            channel: "EMAIL",

            idempotencyKey:
                `boost:${input.listingBoostId}:payment:${input.paymentId}:admin:${input.adminUserId}:email`,

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

/**
 * Queue a listing owner's boost expiry reminder.
 *
 * The reminder is scheduled 24 hours before expiry.
 *
 * Must be called inside the transaction that activates
 * the boost.
 */
export async function enqueueBoostExpiryReminderEmail(
    tx: DatabaseTransaction,
    input: {
        userId: string;
        listingBoostId: string;
        listingId: string;
        expiresAt: Date;
    },
): Promise<void> {
    if (
        !(input.expiresAt instanceof Date) ||
        Number.isNaN(input.expiresAt.getTime())
    ) {
        throw new Error(
            "A valid boost expiry date is required.",
        );
    }

    const payload: BoostExpiryReminderEmailPayload = {
        kind: "BOOST_EXPIRY_REMINDER",
        userId: input.userId,
        listingBoostId: input.listingBoostId,
        listingId: input.listingId,
        expiresAt: input.expiresAt.toISOString(),
    };

    await tx
        .insert(notificationDeliveryJobs)
        .values({
            userId: input.userId,
            channel: "EMAIL",

            idempotencyKey:
                `boost:${input.listingBoostId}:expiry-reminder:${input.expiresAt.getTime()}:email`,

            payload,

            status: "PENDING",
            attempts: 0,
            maxAttempts: MAX_EMAIL_ATTEMPTS,

            availableAt: getBoostReminderAvailableAt(
                input.expiresAt,
            ),
        })
        .onConflictDoNothing({
            target: notificationDeliveryJobs.idempotencyKey,
        });
}