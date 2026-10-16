import {
    and,
    asc,
    eq,
} from "drizzle-orm";

import { isPaystackConfigured } from "../../../config/env.ts";

import { db } from "../../../database/index.ts";

import {
    payments,
} from "../../../database/schema/index.ts";

import {
    createPendingSubscriptionInTransaction,
} from "../../subscriptions/subscription.service.ts";

import {
    createNotification,
} from "../../notification-module/notification.service.ts";

import {
    initializePaystackTransaction,
} from "../paystack/paystack.service.ts";

import {
    enqueuePaymentReconciliation,
} from "../payment-reconcilation/payment-reconcilation.enqueue.service.ts";

import {
    amountToSubunit,
    createPaymentReference,
    getProviderData,
    getUserEmail,
} from "../../../helpers/payment/payment.helpers.ts";

import type {
    SubscriptionPaymentResult,
} from "../payment.types.ts";

export async function initializeSubscriptionPayment(
    userId: string,
    planId: string,
): Promise<SubscriptionPaymentResult> {
    if (!isPaystackConfigured()) {
        throw new Error(
            "Payments are not configured yet. Add PAYSTACK_SECRET_KEY first.",
        );
    }

    const subscription = await db.transaction(
        async (tx) => {
            return createPendingSubscriptionInTransaction(
                {
                    userId,
                    planId,
                },
                tx,
            );
        },
    );

    /*
     * Reuse an existing pending payment.
     *
     * Reconciliation is also ensured here in case a previous
     * request created the payment but failed before queueing it.
     */
    const existingResult = await db
        .select()
        .from(payments)
        .where(
            and(
                eq(
                    payments.subscriptionId,
                    subscription.id,
                ),
                eq(
                    payments.status,
                    "PENDING",
                ),
            ),
        )
        .orderBy(
            asc(
                payments.createdAt,
            ),
        )
        .limit(1);

    const existingPayment = existingResult[0];

    if (existingPayment) {
        await enqueuePaymentReconciliation(
            existingPayment.id,
        );

        const providerData = getProviderData(
            existingPayment.providerData,
        );

        const result: SubscriptionPaymentResult = {
            paymentId: existingPayment.id,

            subscriptionId: subscription.id,

            reference: existingPayment.reference,

            amount: Number(existingPayment.amount),

            currency: existingPayment.currency,

            dealerDiscountPercent: Number(
                existingPayment.discountPercent,
            ),
        };

        if (providerData?.authorization_url) {
            result.authorizationUrl =
                providerData.authorization_url;
        }

        if (providerData?.access_code) {
            result.accessCode =
                providerData.access_code;
        }

        return result;
    }

    const email = await getUserEmail(userId);

    const reference = createPaymentReference(
        "KARMASS-SUB",
    );

    const paymentResult = await db
        .insert(payments)
        .values({
            userId,

            purpose: "SUBSCRIPTION",

            status: "PENDING",

            reference,

            provider: "PAYSTACK",

            amount: subscription.effectivePrice,

            originalAmount: subscription.originalPrice,

            discountPercent: subscription.dealerDiscountPercent,

            discountAmount: (
                Number(subscription.originalPrice) -
                Number(subscription.effectivePrice)
            ).toFixed(2),

            currency: subscription.currency,

            subscriptionId: subscription.id,

            providerData: {
                subscriptionId: subscription.id,

                planId: subscription.planId,

                planVersionId: subscription.planVersionId,

                pricingSnapshot: {
                    originalPrice: subscription.originalPrice,

                    dealerDiscountPercent:
                        subscription.dealerDiscountPercent,

                    effectivePrice: subscription.effectivePrice,

                    currency: subscription.currency,
                },
            },
        })
        .returning();

    const payment = paymentResult[0];

    if (!payment) {
        throw new Error(
            "Unable to create payment record.",
        );
    }

    /*
     * Queue reconciliation immediately after payment creation.
     *
     * If queue insertion fails, leave the payment record intact.
     * The periodic discovery process will recover payments that
     * have no reconciliation record.
     */
    try {
        await enqueuePaymentReconciliation(
            payment.id,
        );
    } catch {
        // Do not discard the payment or stop initialization here.
        // The reconciliation discovery process is the safety net.
    }

    let gateway;

    try {
        gateway = await initializePaystackTransaction({
            email,

            amountSubunit: amountToSubunit(
                Number(subscription.effectivePrice),
                subscription.currency,
            ),

            currency: subscription.currency,

            reference,

            metadata: {
                paymentId: payment.id,

                purpose: "SUBSCRIPTION",

                subscriptionId: subscription.id,

                planId: subscription.planId,

                planVersionId: subscription.planVersionId,

                dealerDiscountPercent: Number(
                    subscription.dealerDiscountPercent,
                ),
            },
        });
    } catch (error) {
        /*
         * A network failure can be ambiguous: Paystack might have
         * received the request even if our server did not receive
         * its response.
         *
         * Do not immediately mark the payment FAILED. Keep it
         * reconcilable so the worker can check its reference.
         */
        throw error;
    }

    await db
        .update(payments)
        .set({
            providerData: {
                ...(gateway.data ?? gateway),

                paymentId: payment.id,

                subscriptionId: subscription.id,
            },

            updatedAt: new Date(),
        })
        .where(
            eq(
                payments.id,
                payment.id,
            ),
        );

    /*
     * Notification failure must not turn a successfully initialized
     * Paystack transaction into a failed payment initialization.
     */
    try {
        await createNotification({
            userId,

            type: "SUBSCRIPTION_PAYMENT_PENDING",

            title: "Subscription payment started",

            message:
                "Complete your payment to activate your KARMASS subscription.",

            data: {
                paymentId: payment.id,

                reference,

                subscriptionId: subscription.id,

                amount: Number(subscription.effectivePrice),

                currency: subscription.currency,
            },
        });
    } catch {
        // Notification delivery should be retried independently.
    }

    const result: SubscriptionPaymentResult = {
        paymentId: payment.id,

        subscriptionId: subscription.id,

        reference,

        amount: Number(subscription.effectivePrice),

        currency: subscription.currency,

        dealerDiscountPercent: Number(
            subscription.dealerDiscountPercent,
        ),
    };

    if (gateway.data?.authorization_url) {
        result.authorizationUrl =
            gateway.data.authorization_url;
    }

    if (gateway.data?.access_code) {
        result.accessCode =
            gateway.data.access_code;
    }

    return result;
}