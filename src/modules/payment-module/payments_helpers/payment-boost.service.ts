import { and, eq, sql } from "drizzle-orm";

import { isPaystackConfigured } from "../../../config/env.ts";
import { db } from "../../../database/index.ts";

import {
    boostPlans,
    listingBoosts,
    listings,
    payments,
} from "../../../database/schema/index.ts";

import { createNotification } from "../../notification-module/notification.service.ts";

import { initializePaystackTransaction } from "../paystack/paystack.service.ts";

import {
    enqueuePaymentReconciliation,
} from "../payment-reconcilation/payment-reconcilation.enqueue.service.ts";

import {
    amountToSubunit,
    createPaymentReference,
    getProviderData,
    getUserEmail,
} from "../../../helpers/payment/payment.helpers.ts";

import {
    claimBoostPaymentInitialization,
    releaseBoostPaymentInitialization,
    saveBoostPaymentInitialization,
} from "../boost-payment/boost-payment-initialization.service.ts";

import type { BoostPaymentResult } from "../payment.types.ts";

type PendingPayment = typeof payments.$inferSelect;

function isUniqueConstraintViolation(error: unknown): boolean {
    return (
        typeof error === "object"
        && error !== null
        && "code" in error
        && error.code === "23505"
    );
}

function toBoostPaymentResult(
    payment: PendingPayment,
): BoostPaymentResult {
    const response: BoostPaymentResult = {
        paymentId: payment.id,
        reference: payment.reference,
        amount: Number(payment.amount),
        currency: payment.currency,
    };

    const providerData = getProviderData(payment.providerData);

    if (providerData?.authorization_url) {
        response.authorizationUrl = providerData.authorization_url;
    }

    if (providerData?.access_code) {
        response.accessCode = providerData.access_code;
    }

    return response;
}

async function findPendingPayment(
    boostId: string,
): Promise<PendingPayment | undefined> {
    const result = await db
        .select()
        .from(payments)
        .where(
            and(
                eq(payments.listingBoostId, boostId),
                eq(payments.purpose, "BOOST"),
                eq(payments.status, "PENDING"),
            ),
        )
        .limit(1);

    return result[0];
}

async function createPendingPayment(
    userId: string,
    boostId: string,
    amount: number,
    currency: string,
): Promise<PendingPayment> {
    const result = await db
        .insert(payments)
        .values({
            userId,
            purpose: "BOOST",
            status: "PENDING",
            reference: createPaymentReference("KARMASS-BOOST"),
            provider: "PAYSTACK",
            amount: amount.toFixed(2),
            originalAmount: amount.toFixed(2),
            currency,
            listingBoostId: boostId,
        })
        .returning();

    const payment = result[0];

    if (!payment) {
        throw new Error("Unable to create boost payment record.");
    }

    return payment;
}

export async function initializeBoostPayment(
    userId: string,
    boostId: string,
): Promise<BoostPaymentResult> {
    if (!isPaystackConfigured()) {
        throw new Error(
            "Payments are not configured yet. Add PAYSTACK_SECRET_KEY first.",
        );
    }

    if (!userId || !boostId) {
        throw new Error("User ID and boost ID are required.");
    }

    /*
     * Lock the listing while validating the boost and creating
     * or reusing its payment record.
     *
     * The transaction ends before any Paystack network request.
     */
    const prepared = await db.transaction(async (tx) => {
        const contextResult = await tx
            .select({
                boostId: listingBoosts.id,
                listingId: listings.id,
                boostStatus: listingBoosts.status,
                sellerId: listings.sellerId,
                boostPlanId: boostPlans.id,
                planPrice: boostPlans.price,
                planCurrency: boostPlans.currency,
                planActive: boostPlans.active,
            })
            .from(listingBoosts)
            .innerJoin(
                boostPlans,
                eq(boostPlans.id, listingBoosts.boostPlanId),
            )
            .innerJoin(
                listings,
                eq(listings.id, listingBoosts.listingId),
            )
            .where(eq(listingBoosts.id, boostId))
            .limit(1);

        const context = contextResult[0];

        if (!context || context.sellerId !== userId) {
            throw new Error(
                "Pending boost not found or unavailable for payment.",
            );
        }

        await tx.execute(sql`
            SELECT pg_advisory_xact_lock(
                hashtext(
                    ${`karmass:listing-boost:${context.listingId}`}
                )
            )
        `);

        /*
         * Re-read the boost after acquiring the lock.
         */
        const lockedContextResult = await tx
            .select({
                boostId: listingBoosts.id,
                listingId: listings.id,
                boostStatus: listingBoosts.status,
                sellerId: listings.sellerId,
                boostPlanId: boostPlans.id,
                planPrice: boostPlans.price,
                planCurrency: boostPlans.currency,
                planActive: boostPlans.active,
            })
            .from(listingBoosts)
            .innerJoin(
                boostPlans,
                eq(boostPlans.id, listingBoosts.boostPlanId),
            )
            .innerJoin(
                listings,
                eq(listings.id, listingBoosts.listingId),
            )
            .where(eq(listingBoosts.id, boostId))
            .limit(1);

        const contextAfterLock = lockedContextResult[0];

        if (
            !contextAfterLock ||
            contextAfterLock.sellerId !== userId ||
            contextAfterLock.boostStatus !== "PENDING" ||
            contextAfterLock.planActive !== 1
        ) {
            throw new Error(
                "Pending boost not found or unavailable for payment.",
            );
        }

        /*
         * Reuse an existing pending payment, or create one while
         * still holding the listing-level advisory lock.
         */
        const existingRows = await tx
            .select()
            .from(payments)
            .where(
                and(
                    eq(payments.listingBoostId, boostId),
                    eq(payments.purpose, "BOOST"),
                    eq(payments.status, "PENDING"),
                ),
            )
            .limit(1);

        let payment = existingRows[0];

        if (!payment) {
            const insertedRows = await tx
                .insert(payments)
                .values({
                    userId,
                    purpose: "BOOST",
                    status: "PENDING",
                    reference: createPaymentReference("KARMASS-BOOST"),
                    provider: "PAYSTACK",
                    amount: Number(
                        contextAfterLock.planPrice,
                    ).toFixed(2),
                    originalAmount: Number(
                        contextAfterLock.planPrice,
                    ).toFixed(2),
                    currency: contextAfterLock.planCurrency,
                    listingBoostId: boostId,
                })
                .returning();

            payment = insertedRows[0];

            if (!payment) {
                throw new Error(
                    "Unable to create boost payment record.",
                );
            }
        }

        if (payment.userId !== userId) {
            throw new Error(
                "Payment ownership validation failed.",
            );
        }

        if (payment.purpose !== "BOOST") {
            throw new Error(
                "Payment purpose validation failed.",
            );
        }

        const expectedAmount = Number(
            contextAfterLock.planPrice,
        ).toFixed(2);

        const expectedCurrency = contextAfterLock.planCurrency;

        if (
            !Number.isFinite(
                Number(contextAfterLock.planPrice),
            ) ||
            Number(contextAfterLock.planPrice) < 0
        ) {
            throw new Error(
                "The configured boost plan price is invalid.",
            );
        }

        if (
            payment.amount !== expectedAmount ||
            payment.currency !== expectedCurrency
        ) {
            throw new Error(
                "The existing boost payment does not match the current boost plan price. Payment reconciliation or a new payment is required.",
            );
        }

        return {
            context: contextAfterLock,
            payment,
        };
    });

    let payment = prepared.payment;
    const context = prepared.context;

    /*
     * Reuse stored Paystack authorization details.
     */
    const storedProviderData = getProviderData(
        payment.providerData,
    );

    if (storedProviderData?.authorization_url) {
        try {
            await enqueuePaymentReconciliation(payment.id);
        } catch {
            // Periodic reconciliation discovery is the fallback.
        }

        return toBoostPaymentResult(payment);
    }

    /*
     * Claim the initialization lease before contacting Paystack.
     */
    const claim = await claimBoostPaymentInitialization(
        payment.id,
    );

    if (!claim.acquired) {
        if (claim.reason === "NOT_PENDING") {
            throw new Error(
                "This payment is no longer pending. Refresh and check its status.",
            );
        }

        try {
            await enqueuePaymentReconciliation(payment.id);
        } catch {
            // Periodic discovery will recover it.
        }

        throw new Error(
            "Payment initialization is already in progress. Please retry shortly.",
        );
    }

    try {
        const email = await getUserEmail(userId);

        const gateway = await initializePaystackTransaction({
            email,
            amountSubunit: amountToSubunit(
                Number(payment.amount),
                payment.currency,
            ),
            currency: payment.currency,
            reference: payment.reference,
            metadata: {
                paymentId: payment.id,
                purpose: "BOOST",
                listingBoostId: boostId,
                listingId: context.listingId,
                boostPlanId: context.boostPlanId,
            },
        });

        const saved = await saveBoostPaymentInitialization(
            payment.id,
            claim.token,
            gateway.data ?? gateway,
        );

        if (!saved) {
            try {
                await enqueuePaymentReconciliation(payment.id);
            } catch {
                // Periodic discovery is the fallback.
            }

            throw new Error(
                "Paystack responded, but the initialization lease could not be saved. Payment reconciliation is required.",
            );
        }

        const refreshedPayment = await db
            .select()
            .from(payments)
            .where(eq(payments.id, payment.id))
            .limit(1);

        const savedPayment = refreshedPayment[0];

        if (!savedPayment) {
            throw new Error(
                "Payment record could not be retrieved after initialization.",
            );
        }

        try {
            await createNotification({
                userId,
                type: "BOOST_PAYMENT_PENDING",
                title: "Boost payment started",
                message:
                    "Complete your payment to activate your listing boost.",
                data: {
                    paymentId: savedPayment.id,
                    reference: savedPayment.reference,
                    listingBoostId: boostId,
                },
            });
        } catch {
            // Notification failure must not invalidate payment initialization.
        }

        try {
            await enqueuePaymentReconciliation(savedPayment.id);
        } catch {
            // Periodic reconciliation is the fallback.
        }

        return toBoostPaymentResult(savedPayment);
    } catch (error) {
        /*
         * Do not immediately release the lease on an uncertain
         * gateway result. The gateway may have processed the
         * request even if the client received an error.
         */
        throw error;
    }
}