import { and, eq, sql } from "drizzle-orm";

import { db } from "../../../database/index.ts";
import { writeAuditRecord } from "../../../helpers/audit/audit.service.ts";

import {
    boostPlans,
    listingBoosts,
    listings,
    Payment,
    payments,
    subscriptions,
} from "../../../database/schema/index.ts";

import {
    activateSubscriptionInTransaction,
    recordSubscriptionHistoryEvent,
} from "../../subscriptions/subscription.service.ts";

import { createNotification } from "../../notification-module/notification.service.ts";

import { verifyPaystackTransaction } from "../paystack/paystack.service.ts";

import {
    amountToSubunit,
    isPaystackSignatureValid,
} from "../../../helpers/payment/payment.helpers.ts";

import type { PaystackTransactionDataLike } from "../payment.types.ts";
import { enqueueSubscriptionActivatedEmail, enqueueSubscriptionExpiryReminderEmail } from "../../notification-module/subscription-email-delivery.service.ts";

/*
 * ============================================================
 * TYPES
 * ============================================================
 */

type PaymentTransaction = Parameters<
    Parameters<typeof db.transaction>[0]
>[0];

type PaymentFulfillmentResult = {
    payment: typeof payments.$inferSelect;
    subscription: unknown | null;
    alreadyFulfilled: boolean;
};

type BoostPurchaseSnapshot = {
    version: 1;
    boostPlanId: string;
    listingBoostId: string;
    listingId: string;
    durationDays: number;
    amount: string;
    currency: string;
};

function mergePaymentProviderData(
    existing: unknown,
    transaction: PaystackTransactionDataLike,
): Record<string, unknown> {
    const existingData =
        typeof existing === "object" &&
        existing !== null &&
        !Array.isArray(existing)
            ? (existing as Record<string, unknown>)
            : {};

    return {
        ...existingData,
        ...transaction,

        // Never allow a gateway response to overwrite
        // the original purchase snapshot.
        ...(existingData.purchaseSnapshot !== undefined
            ? {
                  purchaseSnapshot:
                      existingData.purchaseSnapshot,
              }
            : {}),
    };
}

export class VerifiedGatewayTerminalStatusError extends Error {
    readonly paymentStatus: "FAILED" | "ABANDONED";

    constructor(
        status: "FAILED" | "ABANDONED",
    ) {
        super(
            status === "FAILED"
                ? "Paystack confirmed that this payment failed."
                : "Paystack confirmed that this checkout was abandoned.",
        );

        this.name = "VerifiedGatewayTerminalStatusError";
        this.paymentStatus = status;
    }
}

/*
 * ============================================================
 * UNSUPPORTED PAYSTACK EVENT
 * ============================================================
 */

export class UnsupportedPaystackEventError extends Error {
    constructor(eventType: string) {
        super(`Unsupported Paystack event type: ${eventType}`);

        this.name = "UnsupportedPaystackEventError";
    }
}

/*
 * ============================================================
 * PERSISTED PAYSTACK EVENT PROCESSING
 * ============================================================
 */

export async function processPersistedPaystackEvent(
    eventType: string,
    transaction: PaystackTransactionDataLike,
): Promise<void> {
    const reference = transaction.reference;

    if (
        typeof reference !== "string" ||
        reference.trim().length === 0
    ) {
        throw new Error(
            "Paystack event has no valid payment reference.",
        );
    }

    switch (eventType) {
        case "charge.success":
        case "charge.failed":
        case "charge.abandoned": {
            const gateway =
                await verifyPaystackTransaction(reference);

            const verifiedTransaction = gateway.data;

            if (!verifiedTransaction) {
                throw new Error(
                    "Paystack returned no transaction data during event processing.",
                );
            }

            const paymentRows = await db
                .select()
                .from(payments)
                .where(
                    eq(
                        payments.reference,
                        reference,
                    ),
                )
                .limit(1);

            const payment = paymentRows[0];

            if (!payment) {
                throw new Error(
                    "Payment record not found for Paystack event.",
                );
            }

            validateGatewayTransaction(
                payment.reference,
                payment.amount,
                payment.currency,
                verifiedTransaction,
            );

            if (
                verifiedTransaction.status.toLowerCase() ===
                "success"
            ) {
                await fulfillSuccessfulPayment(
                    reference,
                    verifiedTransaction,
                );

                return;
            }

            if (
                verifiedTransaction.status.toLowerCase() ===
                "failed"
            ) {
                await updatePaymentStatusFromGateway(
                    reference,
                    "failed",
                    verifiedTransaction,
                );

                return;
            }

            if (
                verifiedTransaction.status.toLowerCase() ===
                "abandoned"
            ) {
                await updatePaymentStatusFromGateway(
                    reference,
                    "abandoned",
                    verifiedTransaction,
                );

                return;
            }

            /*
             * Do not classify an ongoing or unresolved
             * Paystack transaction as failed.
             *
             * The reconciliation worker will check it again.
             */
            return;
        }

        case "charge.reversed": {
            /*
             * Reversal handling will be implemented separately.
             * Do not convert a reversal into a payment status.
             */
            throw new Error(
                "Paystack reversal event requires the dedicated payment reversal workflow.",
            );
        }

        default: {
            throw new UnsupportedPaystackEventError(
                eventType,
            );
        }
    }
}

/*
 * ============================================================
 * PAYSTACK HTTP WEBHOOK HANDLER
 * ============================================================
 */

export async function handlePaystackWebhook(
    rawBody: Buffer,
    signature: string,
    event: unknown,
): Promise<void> {
    if (!isPaystackSignatureValid(rawBody, signature)) {
        throw new Error("Invalid Paystack webhook signature.");
    }

    if (
        typeof event !== "object" ||
        event === null ||
        !("event" in event) ||
        !("data" in event)
    ) {
        throw new Error("Invalid Paystack webhook payload.");
    }

    const payload = event as {
        event: unknown;
        data: unknown;
    };

    if (
        typeof payload.event !== "string" ||
        payload.event.trim().length === 0
    ) {
        throw new Error("Invalid Paystack webhook event type.");
    }

    if (typeof payload.data !== "object" || payload.data === null) {
        throw new Error("Invalid Paystack webhook transaction data.");
    }

    const transaction = payload.data as PaystackTransactionDataLike;

    if (
        typeof transaction.reference !== "string" ||
        transaction.reference.trim().length === 0
    ) {
        throw new Error("Paystack webhook transaction reference is missing.");
    }

    await processPersistedPaystackEvent(payload.event, transaction);
}

/*
 * ============================================================
 * VERIFY PAYMENT AND FULFILL
 * ============================================================
 */

export async function verifyAndFulfillPayment(
    userId: string,
    reference: string,
) {
    const existing = await db
        .select()
        .from(payments)
        .where(
            eq(
                payments.reference,
                reference,
            ),
        )
        .limit(1);

    const payment = existing[0];

    if (!payment || payment.userId !== userId) {
        throw new Error("Payment not found.");
    }

    /*
     * SUCCESS is immutable.
     */
    if (payment.status === "SUCCESS") {
        return payment;
    }

    /*
     * FAILED and ABANDONED payments are deliberately
     * allowed to undergo another Paystack verification.
     *
     * This enables automatic late-success recovery.
     */
    const gateway =
        await verifyPaystackTransaction(reference);

    const transaction = gateway.data;

    if (!transaction) {
        throw new Error(
            "Paystack returned no transaction data.",
        );
    }

    validateGatewayTransaction(
        payment.reference,
        payment.amount,
        payment.currency,
        transaction,
    );

    const gatewayStatus =
        transaction.status.trim().toLowerCase();

    /*
     * Independently verified success.
     */
    if (gatewayStatus === "success") {
        return fulfillSuccessfulPayment(
            reference,
            transaction,
        );
    }

    /*
     * Independently verified terminal outcome.
     *
     * Update the payment and throw a typed error so the
     * reconciliation worker knows this was a verified
     * Paystack result, not a temporary network failure.
     */
    if (
        gatewayStatus === "failed" ||
        gatewayStatus === "abandoned"
    ) {
        const mappedStatus =
            gatewayStatus === "failed"
                ? "FAILED"
                : "ABANDONED";

        await updatePaymentStatusFromGateway(
            payment.reference,
            gatewayStatus,
            transaction,
        );

        throw new VerifiedGatewayTerminalStatusError(
            mappedStatus,
        );
    }

    /*
     * Pending, processing, ongoing and unknown statuses
     * must never be treated as terminal outcomes.
     *
     * The reconciliation worker should retry later.
     */
    throw new Error(
        "Your payment is still awaiting confirmation. Please check again shortly.",
    );
}

/*
 * ============================================================
 * UPDATE PAYMENT STATUS
 * ============================================================
 */

async function updatePaymentStatusFromGateway(
    reference: string,
    gatewayStatus: string,
    providerData: unknown,
): Promise<void> {
    const normalizedStatus = gatewayStatus.trim().toLowerCase();

    let mappedStatus: "FAILED" | "ABANDONED" | null = null;

    if (normalizedStatus === "failed") {
        mappedStatus = "FAILED";
    } else if (normalizedStatus === "abandoned") {
        mappedStatus = "ABANDONED";
    }

    if (!mappedStatus) {
        return;
    }

    await db.transaction(async (tx) => {
        const existingRows = await tx
            .select()
            .from(payments)
            .where(
                eq(payments.reference, reference),
            )
            .for("update")
            .limit(1);

        const existingPayment = existingRows[0];

        if (
            !existingPayment ||
            existingPayment.status === "SUCCESS"
        ) {
            return;
        }

        const previousStatus = existingPayment.status;

        const updatedRows = await tx
            .update(payments)
            .set({
                status: mappedStatus,

                providerData: mergePaymentProviderData(
                    existingPayment.providerData,
                    providerData as PaystackTransactionDataLike,
                ),

                updatedAt: new Date(),
            })
            .where(
                eq(
                    payments.id,
                    existingPayment.id,
                ),
            )
            .returning();

        const updatedPayment = updatedRows[0];

        if (!updatedPayment) {
            return;
        }

        /*
         * Do not create duplicate history events when
         * Paystack retries an already processed webhook.
         */
        if (
            previousStatus === mappedStatus ||
            updatedPayment.purpose !== "SUBSCRIPTION" ||
            !updatedPayment.subscriptionId ||
            mappedStatus !== "FAILED"
        ) {
            return;
        }

        const subscriptionRows = await tx
            .select()
            .from(subscriptions)
            .where(
                eq(
                    subscriptions.id,
                    updatedPayment.subscriptionId,
                ),
            )
            .limit(1);

        const subscription = subscriptionRows[0];

        if (!subscription) {
            throw new Error(
                "Subscription not found while recording payment failure.",
            );
        }

        await recordSubscriptionHistoryEvent(tx, {
            subscriptionId: subscription.id,
            userId: subscription.userId,
            event: "PAYMENT_FAILED",
            newStatus: subscription.status,
            amount: updatedPayment.amount,
            currency: updatedPayment.currency,
            reason: "Paystack confirmed that the payment failed.",
            metadata: JSON.stringify({
                paymentId: updatedPayment.id,
                paymentReference: updatedPayment.reference,
                gatewayStatus,
            }),
        });
    });
}

export async function reconcileExpiredPayment(
    paymentId: string,
) {
    const paymentRows = await db
        .select()
        .from(payments)
        .where(eq(payments.id, paymentId))
        .limit(1);

    const payment = paymentRows[0];

    if (!payment) {
        throw new Error(
            "Payment not found during reconciliation.",
        );
    }

    if (payment.status !== "STARTED") {
        return payment;
    }

    const now = new Date();

    const checkoutExpiry =
        payment.checkoutExpiresAt ??
        new Date(
            payment.createdAt.getTime() + 30 * 60_000,
        );

    if (checkoutExpiry > now) {
        return payment;
    }

    /*
     * Verify the transaction independently with Paystack.
     *
     * Network errors must propagate to the reconciliation
     * worker. They must never change the payment status.
     */
    const gateway = await verifyPaystackTransaction(
        payment.reference,
    );

    const transaction = gateway.data;

    if (!transaction) {
        throw new Error(
            "Paystack returned no transaction data during reconciliation.",
        );
    }

    validateGatewayTransaction(
        payment.reference,
        payment.amount,
        payment.currency,
        transaction,
    );

    const gatewayStatus = transaction.status.trim().toLowerCase();

    /*
     * Independently verified success.
     */
    if (gatewayStatus === "success") {
        return fulfillSuccessfulPayment(
            payment.reference,
            transaction,
        );
    }

    /*
     * Only independently verified terminal outcomes
     * may change the payment to a terminal status.
     */
    if (
        gatewayStatus === "failed" ||
        gatewayStatus === "abandoned"
    ) {
        await updatePaymentStatusFromGateway(
            payment.reference,
            gatewayStatus,
            transaction,
        );

        const updatedRows = await db
            .select()
            .from(payments)
            .where(eq(payments.id, payment.id))
            .limit(1);

        return updatedRows[0] ?? payment;
    }

    /*
     * IMPORTANT:
     *
     * Paystack may still report pending, ongoing, or processing
     * after the application checkout expiry.
     *
     * Do not mark these payments ABANDONED.
     * The user must still be able to resume the same session,
     * and reconciliation must retry later.
     */
    return payment;
}


/*
 * ============================================================
 * GATEWAY TRANSACTION VALIDATION
 * ============================================================
 */

function validateEventTransactionReference(
    expectedReference: string,
    transaction: PaystackTransactionDataLike,
): void {
    if (transaction.reference !== expectedReference) {
        throw new Error("Paystack verification reference mismatch.");
    }
}

function validateGatewayTransaction(
    expectedReference: string,
    expectedAmount: string,
    expectedCurrency: string,
    transaction: PaystackTransactionDataLike,
): void {
    validateEventTransactionReference(expectedReference, transaction);

    if (transaction.currency !== expectedCurrency) {
        throw new Error("Payment currency mismatch.");
    }

    if (
        transaction.amount !==
        amountToSubunit(Number(expectedAmount), expectedCurrency)
    ) {
        throw new Error("Payment amount mismatch.");
    }
}

/*
 * ============================================================
 * SUCCESSFUL PAYMENT FULFILLMENT
 * ============================================================
 */

async function fulfillSuccessfulPayment(
    reference: string,
    transaction: PaystackTransactionDataLike,
): Promise<Payment> {
    /*
     * ============================================================
     * 1. VALIDATE BASIC TRANSACTION INFORMATION
     * ============================================================
     */

    const normalizedReference = reference.trim();

    if (!normalizedReference) {
        throw new Error(
            "Payment reference is required.",
        );
    }

    if (
        !transaction ||
        transaction.status?.trim().toLowerCase() !== "success"
    ) {
        throw new Error(
            "Paystack transaction is not successful.",
        );
    }

    if (
        transaction.reference !== normalizedReference
    ) {
        throw new Error(
            "Paystack transaction reference mismatch.",
        );
    }

    /*
     * Validate the payment timestamp before entering
     * the database transaction.
     */

    const paidAt = transaction.paid_at
        ? new Date(transaction.paid_at)
        : new Date();

    if (
        Number.isNaN(paidAt.getTime()) ||
        paidAt.getTime() > Date.now() + 5 * 60 * 1000
    ) {
        throw new Error(
            "Paystack returned an invalid payment timestamp.",
        );
    }

    /*
     * ============================================================
     * 2. ATOMIC PAYMENT FULFILLMENT
     * ============================================================
     */

    const result = await db.transaction(
        async (tx): Promise<PaymentFulfillmentResult> => {
            /*
             * Find the payment using its unique reference.
             */

            const initialPaymentRows = await tx
                .select()
                .from(payments)
                .where(
                    eq(
                        payments.reference,
                        normalizedReference,
                    ),
                )
                .limit(1);

            const initialPayment = initialPaymentRows[0];

            if (!initialPayment) {
                throw new Error(
                    "Payment record not found.",
                );
            }

            /*
             * PostgreSQL transaction-scoped advisory lock.
             *
             * This prevents two concurrent webhook requests
             * from fulfilling the same payment simultaneously.
             */

            await tx.execute(sql`
                SELECT pg_advisory_xact_lock(
                    hashtextextended(
                        ${`karmass:payment:${initialPayment.id}`},
                        0
                    )
                )
            `);

            /*
             * Re-fetch the payment after acquiring the lock.
             *
             * This is important because another request may
             * have fulfilled it while we were waiting.
             */

            const lockedPaymentRows = await tx
                .select()
                .from(payments)
                .where(
                    eq(
                        payments.id,
                        initialPayment.id,
                    ),
                )
                .limit(1);

            const payment = lockedPaymentRows[0];

            if (!payment) {
                throw new Error(
                    "Payment record disappeared during fulfillment.",
                );
            }

            /*
             * ====================================================
             * 3. IDEMPOTENCY CHECK
             * ====================================================
             */

            if (payment.status === "SUCCESS") {
                return {
                    payment,
                    subscription: null,
                    alreadyFulfilled: true,
                };
            }

            /*
             * ====================================================
             * 4. VALIDATE VERIFIED PAYSTACK TRANSACTION
             * ====================================================
             */

            validateGatewayTransaction(
                payment.reference,
                payment.amount,
                payment.currency,
                transaction,
            );

            /*
             * Ensure the payment is being fulfilled using
             * the correct transaction purpose.
             */

            if (
                payment.purpose !== "SUBSCRIPTION" &&
                payment.purpose !== "BOOST"
            ) {
                throw new Error(
                    `Unsupported payment purpose: ${payment.purpose}.`,
                );
            }

            /*
             * ====================================================
             * 5. FULFILL SUBSCRIPTION OR BOOST
             * ====================================================
             *
             * These functions must update the payment status
             * to SUCCESS within this same transaction.
             */

            if (payment.purpose === "SUBSCRIPTION") {
                return fulfillSubscriptionPayment(
                    tx,
                    payment,
                    transaction,
                    paidAt,
                );
            }

            return fulfillBoostPayment(
                tx,
                payment,
                transaction,
                paidAt,
            );
        },
    );

    /*
     * ============================================================
     * 6. DATABASE TRANSACTION HAS COMMITTED
     * ============================================================
     *
     * Never send notifications before the transaction commits.
     *
     * If notification delivery fails, the payment must remain
     * successful.
     */

    if (result.alreadyFulfilled) {
        return result.payment;
    }

    /*
     * ============================================================
     * 7. SUBSCRIPTION SUCCESS NOTIFICATION
     * ============================================================
     */

    if (
        result.payment.purpose === "SUBSCRIPTION" &&
        result.payment.subscriptionId
    ) {
        try {
            await createNotification({
                userId: result.payment.userId,

                type: "SUBSCRIPTION_ACTIVATED",

                title: "Subscription activated",

                message:
                    "Your KARMASS subscription is now active and your listing credits have been added.",

                data: {
                    paymentId: result.payment.id,
                    reference: normalizedReference,
                    subscriptionId:
                        result.payment.subscriptionId,
                },

                /*
                 * Subscription emails are already queued
                 * transactionally by fulfillment.
                 */
                sendEmail: false,
            });
        } catch (error) {
            /*
             * Notification failure must never reverse
             * or invalidate a successful payment.
             *
             * A durable notification outbox should handle
             * eventual notification delivery.
             */
            console.error(
                "[PAYMENT] Subscription success notification failed:",
                {
                    paymentId: result.payment.id,
                    reference: normalizedReference,
                    error,
                },
            );
        }
    }

    /*
     * ============================================================
     * 8. BOOST SUCCESS NOTIFICATION
     * ============================================================
     */

    if (
        result.payment.purpose === "BOOST" &&
        result.payment.listingBoostId
    ) {
        try {
            await createNotification({
                userId: result.payment.userId,

                type: "BOOST_PAYMENT_SUCCESSFUL",

                title: "Boost payment successful",

                message:
                    "Your payment was received successfully. Your listing boost is awaiting administrator approval. Its duration will begin after approval.",

                data: {
                    paymentId: result.payment.id,
                    reference: normalizedReference,
                    listingBoostId:
                        result.payment.listingBoostId,
                    status: "AWAITING_APPROVAL",
                },
            });
        } catch (error) {
            console.error(
                "[PAYMENT] Boost success notification failed:",
                {
                    paymentId: result.payment.id,
                    reference: normalizedReference,
                    error,
                },
            );
        }
    }

    /*
     * ============================================================
     * 9. RETURN SUCCESSFUL PAYMENT
     * ============================================================
     */

    return result.payment;
}

/*
 * ============================================================
 * SUBSCRIPTION PAYMENT FULFILLMENT
 * ============================================================
 */

async function fulfillSubscriptionPayment(
    tx: PaymentTransaction,
    payment: typeof payments.$inferSelect,
    transaction: PaystackTransactionDataLike,
    paidAt: Date,
): Promise<PaymentFulfillmentResult> {
    if (payment.purpose !== "SUBSCRIPTION") {
        throw new Error(
            "Payment purpose mismatch: expected SUBSCRIPTION.",
        );
    }

    if (!payment.subscriptionId) {
        throw new Error(
            "Subscription payment has no subscription target.",
        );
    }

    if (payment.status === "SUCCESS") {
        throw new Error(
            "Subscription payment has already been fulfilled.",
        );
    }

    if (transaction.status?.toLowerCase() !== "success") {
        throw new Error(
            "Paystack transaction is not successful.",
        );
    }

    validateGatewayTransaction(
        payment.reference,
        payment.amount,
        payment.currency,
        transaction,
    );

    if (
        !(paidAt instanceof Date) ||
        Number.isNaN(paidAt.getTime())
    ) {
        throw new Error(
            "Invalid payment completion timestamp.",
        );
    }

    /*
     * Lock the subscription so concurrent fulfillment attempts
     * cannot activate or modify it simultaneously.
     */
    const subscriptionRows = await tx
        .select()
        .from(subscriptions)
        .where(
            eq(
                subscriptions.id,
                payment.subscriptionId,
            ),
        )
        .limit(1)
        .for("update");

    const subscription = subscriptionRows[0];

    if (!subscription) {
        throw new Error(
            "Subscription not found for this payment.",
        );
    }

    /*
     * Verify ownership.
     */
    if (subscription.userId !== payment.userId) {
        throw new Error(
            "Payment and subscription ownership mismatch.",
        );
    }

    /*
     * Verify the payment belongs to the expected subscription.
     */
    if (payment.subscriptionId !== subscription.id) {
        throw new Error(
            "Payment references a different subscription.",
        );
    }

    /*
     * Verify the amount and currency against the subscription.
     */
    if (payment.amount !== subscription.effectivePrice) {
        throw new Error(
            "Payment amount does not match the subscription price.",
        );
    }

    if (
        Number(payment.discountPercent) !==
        Number(subscription.appliedDiscountPercent)
    ) {
        throw new Error(
            "Payment discount does not match the subscription discount.",
        );
    }

    if (payment.currency !== subscription.currency) {
        throw new Error(
            "Payment currency does not match the subscription currency.",
        );
    }

    if (
        payment.originalAmount !== subscription.originalPrice
    ) {
        throw new Error(
            "Payment original price does not match the subscription price.",
        );
    }

    /*
     * Validate persisted payment metadata.
     */
    const providerData = payment.providerData;

    if (
        typeof providerData === "object" &&
        providerData !== null &&
        !Array.isArray(providerData)
    ) {
        const storedData =
            providerData as Record<string, unknown>;

        if (
            storedData.subscriptionId !== undefined &&
            storedData.subscriptionId !== subscription.id
        ) {
            throw new Error(
                "Payment metadata references a different subscription.",
            );
        }

        if (
            storedData.planId !== undefined &&
            storedData.planId !== subscription.planId
        ) {
            throw new Error(
                "Payment plan does not match the subscription plan.",
            );
        }
    }

    /*
     * Activate the subscription and grant its listing credits.
     *
     * This operation must remain inside this transaction.
     * If any subsequent operation fails, the activation and
     * credit allocation will also roll back.
     */
    const activatedSubscription =
        await activateSubscriptionInTransaction(
            subscription.id,
            payment.reference,
            tx,
        );

    if (!activatedSubscription.expiresAt) {
        throw new Error(
            "Activated subscription has no expiry date.",
        );
    }

    /*
     * Mark the payment successful.
     *
     * SUCCESS is immutable. Other statuses can transition to
     * SUCCESS after independently verified Paystack success.
     */
    const updatedPaymentRows = await tx
        .update(payments)
        .set({
            status: "SUCCESS",
            gatewayTransactionId: String(transaction.id),
            providerData: mergePaymentProviderData(
                payment.providerData,
                transaction,
            ),
            paidAt,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(payments.id, payment.id),
                sql`${payments.status} <> 'SUCCESS'`,
            ),
        )
        .returning();

    const fulfilledPayment = updatedPaymentRows[0];

    if (!fulfilledPayment) {
        throw new Error(
            "Subscription payment fulfillment failed.",
        );
    }

    /*
     * Queue subscription emails transactionally.
     *
     * These are durable jobs, not direct email deliveries.
     * The notification worker handles actual delivery.
     */
    await enqueueSubscriptionActivatedEmail(tx, {
        userId: subscription.userId,
        subscriptionId: subscription.id,
        paymentId: fulfilledPayment.id,
    });

    await enqueueSubscriptionExpiryReminderEmail(tx, {
        userId: subscription.userId,
        subscriptionId: subscription.id,
        expiresAt: activatedSubscription.expiresAt,
    });

    /*
     * Record the successful payment.
     */
    await writeAuditRecord(tx, {
        actorUserId: payment.userId,
        action: "PAYMENT_SUCCEEDED",
        entityType: "PAYMENT",
        entityId: fulfilledPayment.id,
        metadata: {
            purpose: fulfilledPayment.purpose,
            amount: fulfilledPayment.amount,
            currency: fulfilledPayment.currency,
            subscriptionId: fulfilledPayment.subscriptionId,
            gatewayTransactionId: fulfilledPayment.gatewayTransactionId,
            paidAt: paidAt.toISOString(),
        },
    });

    return {
        payment: fulfilledPayment,
        subscription: activatedSubscription,
        alreadyFulfilled: false,
    };
}

/*
 * ============================================================
 * BOOST PAYMENT FULFILLMENT
 * ============================================================
 *
 * A successful payment moves the boost to AWAITING_APPROVAL.
 *
 * The boost is NOT activated here. Its duration starts only
 * after an administrator approves it.
 */

async function fulfillBoostPayment(
    tx: PaymentTransaction,
    payment: typeof payments.$inferSelect,
    transaction: PaystackTransactionDataLike,
    paidAt: Date,
): Promise<PaymentFulfillmentResult> {
    if (payment.purpose !== "BOOST") {
        throw new Error(
            "Payment purpose mismatch: expected BOOST.",
        );
    }

    if (!payment.listingBoostId) {
        throw new Error(
            "Boost payment has no boost target.",
        );
    }

    if (payment.status === "SUCCESS") {
        throw new Error(
            "Boost payment has already been fulfilled.",
        );
    }

    if (transaction.status?.toLowerCase() !== "success") {
        throw new Error(
            "Paystack transaction is not successful.",
        );
    }

    validateGatewayTransaction(
        payment.reference,
        payment.amount,
        payment.currency,
        transaction,
    );

    if (
        !(paidAt instanceof Date) ||
        Number.isNaN(paidAt.getTime())
    ) {
        throw new Error(
            "Invalid payment completion timestamp.",
        );
    }

    /*
     * Retrieve the original purchase snapshot.
     *
     * The snapshot contains the boost plan details
     * that were valid when the customer initiated
     * the payment.
     */
    const providerData = payment.providerData as
        | Record<string, unknown>
        | null;

    const purchaseSnapshot = providerData
        ?.purchaseSnapshot as
        | BoostPurchaseSnapshot
        | undefined;

    if (!purchaseSnapshot) {
        throw new Error(
            "Boost payment is missing its purchase snapshot. Manual payment reconciliation is required.",
        );
    }

    /*
     * Validate the snapshot structure.
     */
    if (
        purchaseSnapshot.version !== 1 ||
        typeof purchaseSnapshot.boostPlanId !== "string" ||
        typeof purchaseSnapshot.listingBoostId !== "string" ||
        typeof purchaseSnapshot.listingId !== "string" ||
        !Number.isSafeInteger(
            purchaseSnapshot.durationDays,
        ) ||
        purchaseSnapshot.durationDays <= 0 ||
        typeof purchaseSnapshot.amount !== "string" ||
        typeof purchaseSnapshot.currency !== "string"
    ) {
        throw new Error(
            "Boost payment purchase snapshot is invalid. Manual payment reconciliation is required.",
        );
    }

    /*
     * First locate the boost and associated listing.
     */
    const initialBoostRows = await tx
        .select({
            boost: listingBoosts,
            listingId: listings.id,
        })
        .from(listingBoosts)
        .innerJoin(
            listings,
            eq(
                listingBoosts.listingId,
                listings.id,
            ),
        )
        .where(
            eq(
                listingBoosts.id,
                payment.listingBoostId,
            ),
        )
        .limit(1);

    const initialBoost = initialBoostRows[0];

    if (!initialBoost) {
        throw new Error(
            "Boost or associated listing not found. Manual payment reconciliation is required.",
        );
    }

    /*
     * Serialize boost operations for this listing.
     */
    await tx.execute(sql`
        SELECT pg_advisory_xact_lock(
            hashtextextended(
                ${`karmass:listing-boost:${initialBoost.listingId}`},
                0
            )
        )
    `);

    /*
     * Lock the boost row.
     */
    const lockedBoostRows = await tx
        .select()
        .from(listingBoosts)
        .where(
            eq(
                listingBoosts.id,
                payment.listingBoostId,
            ),
        )
        .for("update")
        .limit(1);

    const boost = lockedBoostRows[0];

    if (!boost) {
        throw new Error(
            "Boost disappeared during fulfillment.",
        );
    }

    if (
        boost.listingId !== initialBoost.listingId
    ) {
        throw new Error(
            "Boost listing association changed during fulfillment.",
        );
    }

    if (boost.status !== "PENDING") {
        throw new Error(
            `Boost is no longer pending (current status: ${boost.status}). Manual payment reconciliation is required.`,
        );
    }

    /*
     * Verify that the purchase snapshot belongs
     * to this exact boost and listing.
     */
    if (
        purchaseSnapshot.listingBoostId !== boost.id
    ) {
        throw new Error(
            "Boost purchase snapshot does not match the payment's boost target.",
        );
    }

    if (
        purchaseSnapshot.listingId !== boost.listingId
    ) {
        throw new Error(
            "Boost purchase snapshot listing does not match the associated listing.",
        );
    }

    if (
        purchaseSnapshot.boostPlanId !== boost.boostPlanId
    ) {
        throw new Error(
            "Boost purchase snapshot plan does not match the selected boost plan.",
        );
    }

    /*
     * The payment amount and currency must match
     * the original purchase snapshot.
     *
     * Do not compare against the current boost plan
     * price or currency because administrators may
     * have changed those values after purchase.
     */
    if (
        purchaseSnapshot.amount !== payment.amount
    ) {
        throw new Error(
            "Boost payment amount does not match its original purchase snapshot.",
        );
    }

    if (
        purchaseSnapshot.currency.trim().toUpperCase() !==
        payment.currency.trim().toUpperCase()
    ) {
        throw new Error(
            "Boost payment currency does not match its original purchase snapshot.",
        );
    }

    /*
     * Lock and verify listing ownership.
     */
    const listingRows = await tx
        .select({
            id: listings.id,
            sellerId: listings.sellerId,
        })
        .from(listings)
        .where(
            eq(
                listings.id,
                boost.listingId,
            ),
        )
        .for("update")
        .limit(1);

    const listing = listingRows[0];

    if (!listing) {
        throw new Error(
            "Associated listing no longer exists. Manual payment reconciliation is required.",
        );
    }

    if (listing.sellerId !== payment.userId) {
        throw new Error(
            "Boost payment ownership mismatch: the payment user does not own the listing.",
        );
    }

    /*
     * Confirm that the originally selected boost plan
     * still exists.
     *
     * Do not validate its current price, currency,
     * duration, or active status.
     *
     * The purchase snapshot is authoritative for
     * this historical payment.
     */
    const planRows = await tx
        .select({
            id: boostPlans.id,
        })
        .from(boostPlans)
        .where(
            eq(
                boostPlans.id,
                purchaseSnapshot.boostPlanId,
            ),
        )
        .limit(1);

    const plan = planRows[0];

    if (!plan) {
        throw new Error(
            "Purchased boost plan no longer exists. Manual payment reconciliation is required.",
        );
    }

    /*
     * Mark payment as successful.
     *
     * Preserve the original purchase snapshot while
     * merging the verified Paystack transaction.
     */
    const updatedPaymentRows = await tx
        .update(payments)
        .set({
            status: "SUCCESS",
            gatewayTransactionId: String(
                transaction.id,
            ),
            providerData: mergePaymentProviderData(
                payment.providerData,
                transaction,
            ),
            paidAt,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(payments.id, payment.id),
                sql`${payments.status} <> 'SUCCESS'`,
            ),
        )
        .returning();

    const fulfilledPayment = updatedPaymentRows[0];

    if (!fulfilledPayment) {
        throw new Error(
            "Boost payment fulfillment failed.",
        );
    }

    /*
     * Payment is verified.
     *
     * The boost must enter the administrative
     * approval queue, not become active automatically.
     */
    const boostUpdateRows = await tx
        .update(listingBoosts)
        .set({
            status: "AWAITING_APPROVAL",
            paymentVerifiedAt: paidAt,
            startsAt: null,
            expiresAt: null,
            reviewedBy: null,
            reviewedAt: null,
            reviewNote: null,
        })
        .where(
            and(
                eq(
                    listingBoosts.id,
                    boost.id,
                ),
                eq(
                    listingBoosts.status,
                    "PENDING",
                ),
            ),
        )
        .returning();

    const updatedBoost = boostUpdateRows[0];

    if (!updatedBoost) {
        throw new Error(
            "Boost could not be moved to the approval queue.",
        );
    }

    /*
     * Audit successful payment fulfillment.
     *
     * Use the purchased duration from the snapshot,
     * not the current boost plan configuration.
     */
    await writeAuditRecord(tx, {
        actorUserId: payment.userId,
        action: "PAYMENT_SUCCEEDED",
        entityType: "PAYMENT",
        entityId: fulfilledPayment.id,
        metadata: {
            purpose: fulfilledPayment.purpose,
            amount: fulfilledPayment.amount,
            currency: fulfilledPayment.currency,
            listingBoostId: fulfilledPayment.listingBoostId,
            listingId: listing.id,
            boostPlanId: purchaseSnapshot.boostPlanId,
            boostDurationDays:
                purchaseSnapshot.durationDays,
            gatewayTransactionId:
                fulfilledPayment.gatewayTransactionId,
            paidAt: paidAt.toISOString(),
            boostStatus: updatedBoost.status,
        },
    });

    return {
        payment: fulfilledPayment,
        subscription: null,
        alreadyFulfilled: false,
    };
}