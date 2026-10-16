import { and, eq, sql } from "drizzle-orm";

import { db } from "../../../database/index.ts";
import { writeAuditRecord } from "../../../helpers/audit/audit.service.ts";

import {
    boostPlans,
    listingBoosts,
    listings,
    payments,
    subscriptions,
} from "../../../database/schema/index.ts";

import { activateSubscriptionInTransaction } from "../../subscriptions/subscription.service.ts";

import { createNotification } from "../../notification-module/notification.service.ts";

import { verifyPaystackTransaction } from "../paystack/paystack.service.ts";

import {
    amountToSubunit,
    isPaystackSignatureValid,
    mapGatewayStatus,
} from "../../../helpers/payment/payment.helpers.ts";

import type { PaystackTransactionDataLike } from "../payment.types.ts";

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
 *
 * Called by the payment-event worker after the webhook has been
 * signature-verified and durably persisted.
 *
 * The worker should handle UnsupportedPaystackEventError by marking
 * the event IGNORED instead of retrying it indefinitely.
 */

export async function processPersistedPaystackEvent(
    eventType: string,
    transaction: PaystackTransactionDataLike,
): Promise<void> {
    const reference = transaction.reference;

    if (typeof reference !== "string" || reference.trim().length === 0) {
        throw new Error("Paystack event has no valid payment reference.");
    }

    switch (eventType) {
        case "charge.success": {
            /*
             * Never fulfill a payment using webhook payload data alone.
             * Independently verify the transaction with Paystack.
             */
            const gateway = await verifyPaystackTransaction(reference);

            const verifiedTransaction = gateway.data;

            if (!verifiedTransaction) {
                throw new Error(
                    "Paystack returned no transaction data during event processing.",
                );
            }

            validateEventTransactionReference(reference, verifiedTransaction);

            if (verifiedTransaction.status !== "success") {
                throw new Error(
                    `Paystack verification has not confirmed success. Status: ${verifiedTransaction.status}.`,
                );
            }

            await fulfillSuccessfulPayment(reference, verifiedTransaction);

            return;
        }

        case "charge.failed":
        case "charge.abandoned": {
            /*
             * Verify the transaction before updating its status.
             * A delayed failure event must never downgrade a successful
             * payment.
             */
            const gateway = await verifyPaystackTransaction(reference);

            const verifiedTransaction = gateway.data;

            if (!verifiedTransaction) {
                throw new Error(
                    "Paystack returned no transaction data during event processing.",
                );
            }

            validateEventTransactionReference(reference, verifiedTransaction);

            /*
             * A transaction may have succeeded even if an older
             * failure event is being delivered.
             */
            if (verifiedTransaction.status === "success") {
                await fulfillSuccessfulPayment(reference, verifiedTransaction);

                return;
            }

            await updatePaymentStatusFromGateway(
                reference,
                verifiedTransaction.status,
                verifiedTransaction,
            );

            return;
        }

        case "charge.reversed": {
            /*
             * A reversal is a financial event, not an ordinary failed
             * payment. Do not overwrite SUCCESS with FAILED.
             *
             * A dedicated reversal workflow should record the reversal,
             * reconcile the original transaction, and determine whether
             * subscription or boost access needs to be adjusted.
             *
             * Until that workflow exists, throw so the worker can retain
             * the event for retry/dead-letter investigation.
             */
            throw new Error(
                "Reversed payment events require the dedicated reversal workflow.",
            );
        }

        default: {
            throw new UnsupportedPaystackEventError(eventType);
        }
    }
}

/*
 * ============================================================
 * PAYSTACK HTTP WEBHOOK HANDLER
 * ============================================================
 *
 * IMPORTANT:
 * This function verifies the signature and validates the payload.
 * It does not fulfill payments synchronously.
 *
 * To use durable webhook processing, the controller must persist the
 * complete webhook event using the payment-event ingestion service,
 * then return HTTP 200 after persistence succeeds.
 *
 * This handler currently remains available for compatibility with
 * existing callers. Do not use it as a substitute for event ingestion.
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

    /*
     * This validates the basic transaction shape. Durable ingestion
     * should store the complete original payload and let the worker
     * perform independent gateway verification.
     */
    const transaction = payload.data as PaystackTransactionDataLike;

    if (
        typeof transaction.reference !== "string" ||
        transaction.reference.trim().length === 0
    ) {
        throw new Error("Paystack webhook transaction reference is missing.");
    }

    /*
     * Do not call fulfillSuccessfulPayment() directly here.
     * The controller should use the ingestion service to persist this
     * event after signature verification.
     *
     * This compatibility handler processes the event through the same
     * gateway-verification path. New webhook controllers should instead
     * persist the event and let the background worker process it.
     */
    await processPersistedPaystackEvent(payload.event, transaction);
}

/*
 * ============================================================
 * VERIFY PAYMENT AND FULFILL
 * ============================================================
 *
 * Used by an authenticated user-facing payment verification endpoint.
 * The user must own the payment reference.
 */

export async function verifyAndFulfillPayment(
    userId: string,
    reference: string,
) {
    const existing = await db
        .select()
        .from(payments)
        .where(eq(payments.reference, reference))
        .limit(1);

    const payment = existing[0];

    if (!payment || payment.userId !== userId) {
        throw new Error("Payment not found.");
    }

    /*
     * An already successful payment is idempotent.
     */
    if (payment.status === "SUCCESS") {
        return payment;
    }

    const gateway = await verifyPaystackTransaction(reference);

    const transaction = gateway.data;

    if (!transaction) {
        throw new Error("Paystack returned no transaction data.");
    }

    validateGatewayTransaction(
        payment.reference,
        payment.amount,
        payment.currency,
        transaction,
    );

    if (transaction.status !== "success") {
        await updatePaymentStatusFromGateway(
            payment.reference,
            transaction.status,
            transaction,
        );

        throw new Error(
            `Payment is not successful. Current status: ${transaction.status}.`,
        );
    }

    return fulfillSuccessfulPayment(reference, transaction);
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
    const mappedStatus = mapGatewayStatus(gatewayStatus);

    await db
        .update(payments)
        .set({
            status: mappedStatus,
            providerData,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(payments.reference, reference),
                sql`${payments.status} <> 'SUCCESS'`,
            ),
        );
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
 *
 * Uses a database transaction and a PostgreSQL advisory transaction
 * lock to prevent concurrent fulfillment of the same payment.
 */

async function fulfillSuccessfulPayment(
    reference: string,
    transaction: PaystackTransactionDataLike,
) {
    const result = await db.transaction(
        async (tx): Promise<PaymentFulfillmentResult> => {
            const paymentRows = await tx
                .select()
                .from(payments)
                .where(eq(payments.reference, reference))
                .limit(1);

            const initialPayment = paymentRows[0];

            if (!initialPayment) {
                throw new Error("Payment record not found.");
            }

            /*
             * Serialize fulfillment attempts for this payment.
             * The lock is held until this transaction commits
             * or rolls back.
             */
            await tx.execute(
                sql`
                    SELECT pg_advisory_xact_lock(
                        hashtext(
                            ${`karmass:payment:${initialPayment.id}`}
                        )
                    )
                `,
            );

            /*
             * CRITICAL: re-read the payment after acquiring the
             * advisory lock. The previously selected row may have
             * become stale while this transaction was waiting.
             */
            const lockedPaymentRows = await tx
                .select()
                .from(payments)
                .where(eq(payments.id, initialPayment.id))
                .limit(1);

            const payment = lockedPaymentRows[0];

            if (!payment) {
                throw new Error(
                    "Payment record disappeared during fulfillment.",
                );
            }

            /*
             * Another request may have fulfilled the payment while
             * this request was waiting for the lock.
             */
            if (payment.status === "SUCCESS") {
                return {
                    payment,
                    subscription: null,
                    alreadyFulfilled: true,
                };
            }

            validateGatewayTransaction(
                payment.reference,
                payment.amount,
                payment.currency,
                transaction,
            );

            if (transaction.status !== "success") {
                throw new Error("Paystack transaction is not successful.");
            }

            const paidAt = transaction.paid_at
                ? new Date(transaction.paid_at)
                : new Date();

            if (Number.isNaN(paidAt.getTime())) {
                throw new Error("Invalid payment timestamp.");
            }

            if (payment.purpose === "SUBSCRIPTION") {
                return fulfillSubscriptionPayment(
                    tx,
                    payment,
                    transaction,
                    paidAt,
                );
            }

            if (payment.purpose === "BOOST") {
                return fulfillBoostPayment(tx, payment, transaction, paidAt);
            }

            throw new Error(`Unsupported payment purpose: ${payment.purpose}.`);
        },
    );

    /*
     * The database transaction has committed before notifications
     * are attempted. Notification delivery should eventually be moved
     * to a durable outbox so a notification failure cannot lose the
     * notification permanently.
     */
    if (result.alreadyFulfilled) {
        return result.payment;
    }

    if (
        result.payment.purpose === "SUBSCRIPTION" &&
        result.payment.subscriptionId
    ) {
        await createNotification({
            userId: result.payment.userId,

            type: "SUBSCRIPTION_ACTIVATED",

            title: "Subscription activated",

            message:
                "Your KARMASS subscription is now active and your listing credits have been added.",

            data: {
                paymentId: result.payment.id,
                reference,
                subscriptionId: result.payment.subscriptionId,
            },
        });
    }

    if (
        result.payment.purpose === "BOOST" &&
        result.payment.listingBoostId
    ) {
        await createNotification({
            userId: result.payment.userId,

            type: "BOOST_PAYMENT_SUCCESSFUL",

            title: "Boost payment successful",

            message: "Your payment was received successfully. Your listing boost is awaiting administrator approval. Its duration will begin after approval.",

            data: {
                paymentId: result.payment.id,
                reference,
                listingBoostId: result.payment.listingBoostId,
                status: "AWAITING_APPROVAL",
            },
        });
    }

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
    if (!payment.subscriptionId) {
        throw new Error(
            "Subscription payment has no subscription target.",
        );
    }

    /*
     * Lock the subscription row so its ownership, pricing,
     * and lifecycle state cannot be changed concurrently
     * while this payment is being fulfilled.
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
        .for("update")
        .limit(1);

    const subscription = subscriptionRows[0];

    if (!subscription) {
        throw new Error(
            "Subscription not found for this payment.",
        );
    }

    /*
     * A payment must never activate another user's subscription.
     */
    if (subscription.userId !== payment.userId) {
        throw new Error(
            "Payment and subscription ownership mismatch.",
        );
    }

    /*
     * Validate the persisted financial snapshot.
     */
    if (
        payment.amount !== subscription.effectivePrice
    ) {
        throw new Error(
            "Payment amount does not match the subscription price.",
        );
    }

    if (
        payment.currency !== subscription.currency
    ) {
        throw new Error(
            "Payment currency does not match the subscription currency.",
        );
    }

    /*
     * Check that the payment metadata references the same
     * subscription and plan, when those fields are present.
     */
    const providerData = payment.providerData;

    if (
        typeof providerData === "object" &&
        providerData !== null &&
        !Array.isArray(providerData)
    ) {
        const storedData = providerData as Record<
            string,
            unknown
        >;

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
     * Confirm that Paystack reports a successful transaction.
     * The caller independently validates the gateway reference,
     * amount, and currency before reaching this function.
     */
    if (transaction.status !== "success") {
        throw new Error(
            "Paystack transaction is not successful.",
        );
    }

    /*
     * Activate the subscription and grant credits in the same
     * database transaction as the payment update.
     */
    const activatedSubscription =
        await activateSubscriptionInTransaction(
            subscription.id,
            payment.reference,
            tx,
        );

    const updated = await tx
        .update(payments)
        .set({
            status: "SUCCESS",
            gatewayTransactionId: String(
                transaction.id,
            ),
            providerData: transaction,
            paidAt,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(
                    payments.id,
                    payment.id,
                ),
                sql`${payments.status} <> 'SUCCESS'`,
            ),
        )
        .returning();

    const fulfilled = updated[0];

    if (!fulfilled) {
        throw new Error(
            "Subscription payment fulfillment failed.",
        );
    }

    await writeAuditRecord(tx, {
        actorUserId: payment.userId,
        action: "PAYMENT_SUCCEEDED",
        entityType: "PAYMENT",
        entityId: fulfilled.id,
        metadata: {
            purpose: fulfilled.purpose,
            amount: fulfilled.amount,
            currency: fulfilled.currency,
            subscriptionId: fulfilled.subscriptionId,
        },
    });

    return {
        payment: fulfilled,
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
    if (!payment.listingBoostId) {
        throw new Error(
            "Boost payment has no boost target.",
        );
    }

    /*
     * Find the boost and its associated listing.
     */
    const boostRows = await tx
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

    const boostRecord = boostRows[0];

    if (!boostRecord) {
        /*
         * Throwing here rolls back the payment update.
         * The caller must retain/retry the event and alert
         * operations for reconciliation.
         *
         * Do not silently discard a payment whose boost
         * target is missing.
         */
        throw new Error(
            "Boost record or associated listing not found. Manual payment reconciliation is required.",
        );
    }

    /*
     * Serialize fulfillment for this listing.
     */
    await tx.execute(sql`
        SELECT pg_advisory_xact_lock(
            hashtext(
                ${`karmass:listing-boost:${boostRecord.listingId}`}
            )
        )
    `);

    /*
     * Re-read the boost after acquiring the listing lock.
     */
    const lockedBoostRows = await tx
        .select({
            boost: listingBoosts,
        })
        .from(listingBoosts)
        .where(
            eq(
                listingBoosts.id,
                payment.listingBoostId,
            ),
        )
        .limit(1);

    const lockedBoost = lockedBoostRows[0]?.boost;

    if (!lockedBoost) {
        throw new Error(
            "Boost disappeared during payment fulfillment. Manual reconciliation is required.",
        );
    }

    /*
     * A boost that is already active, rejected, cancelled,
     * or otherwise transitioned must not be silently moved
     * into the approval queue.
     *
     * The payment and entitlement need explicit reconciliation
     * if this happens after the gateway reports success.
     */
    if (lockedBoost.status !== "PENDING") {
        throw new Error(
            `Boost is no longer pending (current status: ${lockedBoost.status}). Manual payment reconciliation is required.`,
        );
    }

    /*
     * Record the payment as successful first, within the same
     * transaction as the transition to AWAITING_APPROVAL.
     *
     * This does not activate the boost or start its duration.
     */
    const updatedPaymentRows = await tx
        .update(payments)
        .set({
            status: "SUCCESS",
            gatewayTransactionId: String(transaction.id),
            providerData: transaction,
            paidAt,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(
                    payments.id,
                    payment.id,
                ),
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
        },
    });

    const boostUpdateRows = await tx
        .update(listingBoosts)
        .set({
            status: "AWAITING_APPROVAL",
            paymentVerifiedAt: paidAt,

            /*
             * Activation timestamps must remain unset
             * until the administrator approves the boost.
             */
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
                    payment.listingBoostId,
                ),
                eq(
                    listingBoosts.status,
                    "PENDING",
                ),
            ),
        )
        .returning();

    if (!boostUpdateRows[0]) {
        throw new Error(
            "Boost could not be moved to the approval queue.",
        );
    }

    return {
        payment: fulfilledPayment,
        subscription: null,
        alreadyFulfilled: false,
    };
}