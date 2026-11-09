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
    saveBoostPaymentInitialization,
} from "../boost-payment/boost-payment-initialization.service.ts";

import {
    verifyAndFulfillPayment,
    VerifiedGatewayTerminalStatusError,
} from "./payment-fulfillment.service.ts";

import type { BoostPaymentResult } from "../payment.types.ts";

const CHECKOUT_TTL_MINUTES = 30;

const MAX_SESSION_ATTEMPTS = 3;

type StartedPayment = typeof payments.$inferSelect;

type BoostPurchaseSnapshot = {
    version: 1;
    boostPlanId: string;
    listingBoostId: string;
    listingId: string;
    durationDays: number;
    amount: string;
    currency: string;
};

type BoostPaymentProviderData = Record<string, unknown> & {
    purchaseSnapshot?: BoostPurchaseSnapshot;
};

function toProviderObject(
    value: unknown,
): BoostPaymentProviderData {
    if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
    ) {
        return {};
    }

    return value as BoostPaymentProviderData;
}

function getPurchaseSnapshot(
    payment: StartedPayment,
): BoostPurchaseSnapshot | null {
    const providerData = toProviderObject(
        payment.providerData,
    );

    const snapshot = providerData.purchaseSnapshot;

    if (
        typeof snapshot !== "object" ||
        snapshot === null ||
        Array.isArray(snapshot)
    ) {
        return null;
    }

    const value = snapshot as Record<string, unknown>;

    if (
        value.version !== 1 ||
        typeof value.boostPlanId !== "string" ||
        typeof value.listingBoostId !== "string" ||
        typeof value.listingId !== "string" ||
        typeof value.durationDays !== "number" ||
        !Number.isInteger(value.durationDays) ||
        value.durationDays <= 0 ||
        typeof value.amount !== "string" ||
        typeof value.currency !== "string"
    ) {
        return null;
    }

    return value as BoostPurchaseSnapshot;
}

function toBoostPaymentResult(
    payment: StartedPayment,
): BoostPaymentResult {
    const providerData = getProviderData(
        payment.providerData,
    );

    const response: BoostPaymentResult = {
        paymentId: payment.id,
        reference: payment.reference,
        status: payment.status,
        canResume: false,
        amount: Number(payment.amount),
        currency: payment.currency,
    };

    if (
        payment.status === "STARTED" &&
        providerData?.authorization_url
    ) {
        response.authorizationUrl =
            providerData.authorization_url;

        response.canResume = true;
    }

    if (
        payment.status === "STARTED" &&
        providerData?.access_code
    ) {
        response.accessCode = providerData.access_code;
    }

    return response;
}

async function getPaymentById(
    paymentId: string,
): Promise<StartedPayment | null> {
    const rows = await db
        .select()
        .from(payments)
        .where(eq(payments.id, paymentId))
        .limit(1);

    return rows[0] ?? null;
}

async function safelyEnqueueReconciliation(
    paymentId: string,
): Promise<void> {
    try {
        await enqueuePaymentReconciliation(paymentId);
    } catch {
        /*
         * Periodic reconciliation discovery is the fallback.
         */
    }
}

function getCheckoutExpiry(
    payment: StartedPayment,
): Date {
    return (
        payment.checkoutExpiresAt ??
        new Date(
            payment.createdAt.getTime() +
                CHECKOUT_TTL_MINUTES * 60 * 1000,
        )
    );
}

async function prepareBoostPayment(
    userId: string,
    boostId: string,
): Promise<{
    payment: StartedPayment;
    listingId: string;
    boostPlanId: string;
    isNew: boolean;
}> {
    return db.transaction(async (tx) => {
        const initialContextRows = await tx
            .select({
                listingId: listings.id,
                sellerId: listings.sellerId,
            })
            .from(listingBoosts)
            .innerJoin(
                listings,
                eq(listings.id, listingBoosts.listingId),
            )
            .where(eq(listingBoosts.id, boostId))
            .limit(1);

        const initialContext = initialContextRows[0];

        if (
            !initialContext ||
            initialContext.sellerId !== userId
        ) {
            throw new Error(
                "Pending boost not found or unavailable for payment.",
            );
        }

        /*
         * Serialize payment-session creation for this listing.
         */
        await tx.execute(sql`
            SELECT pg_advisory_xact_lock(
                hashtextextended(
                    ${`karmass:listing-boost:${initialContext.listingId}`},
                    0
                )
            )
        `);

        /*
         * Re-read the boost and plan after acquiring the lock.
         */
        const contextRows = await tx
            .select({
                boostId: listingBoosts.id,
                listingId: listings.id,
                boostStatus: listingBoosts.status,
                sellerId: listings.sellerId,
                boostPlanId: boostPlans.id,
                planPrice: boostPlans.price,
                planCurrency: boostPlans.currency,
                planDurationDays: boostPlans.durationDays,
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

        const context = contextRows[0];

        if (
            !context ||
            context.sellerId !== userId
        ) {
            throw new Error(
                "Pending boost not found or unavailable for payment.",
            );
        }

        /*
         * First look for an existing active payment session.
         *
         * Do not compare its original purchase amount against
         * the current boost plan. Existing payments use their
         * own immutable purchase snapshots.
         */
        const existingRows = await tx
            .select()
            .from(payments)
            .where(
                and(
                    eq(payments.listingBoostId, boostId),
                    eq(payments.purpose, "BOOST"),
                    eq(payments.status, "STARTED"),
                ),
            )
            .limit(1);

        const existingPayment = existingRows[0];

        if (existingPayment) {
            if (existingPayment.userId !== userId) {
                throw new Error(
                    "Payment ownership validation failed.",
                );
            }

            if (existingPayment.purpose !== "BOOST") {
                throw new Error(
                    "Payment purpose validation failed.",
                );
            }

            return {
                payment: existingPayment,
                listingId: context.listingId,
                boostPlanId: context.boostPlanId,
                isNew: false,
            };
        }

        /*
         * A new payment is only allowed for a pending boost
         * with an active plan.
         */
        if (
            context.boostStatus !== "PENDING" ||
            context.planActive !== 1
        ) {
            throw new Error(
                "This boost is not available for a new payment.",
            );
        }

        const price = Number(context.planPrice);

        if (
            !Number.isFinite(price) ||
            price < 0
        ) {
            throw new Error(
                "The configured boost plan price is invalid.",
            );
        }

        if (
            !Number.isInteger(context.planDurationDays) ||
            context.planDurationDays <= 0
        ) {
            throw new Error(
                "The configured boost plan duration is invalid.",
            );
        }

        const amount = price.toFixed(2);

        const purchaseSnapshot: BoostPurchaseSnapshot = {
            version: 1,
            boostPlanId: context.boostPlanId,
            listingBoostId: context.boostId,
            listingId: context.listingId,
            durationDays: context.planDurationDays,
            amount,
            currency: context.planCurrency,
        };

        const insertedRows = await tx
            .insert(payments)
            .values({
                userId,
                purpose: "BOOST",
                status: "STARTED",
                reference: createPaymentReference(
                    "KARMASS-BOOST",
                ),
                provider: "PAYSTACK",
                amount,
                originalAmount: amount,
                currency: context.planCurrency,
                listingBoostId: boostId,
                providerData: {
                    purchaseSnapshot,
                },
                checkoutExpiresAt: new Date(
                    Date.now() +
                        CHECKOUT_TTL_MINUTES * 60 * 1000,
                ),
            })
            .returning();

        const payment = insertedRows[0];

        if (!payment) {
            throw new Error(
                "Unable to create boost payment record.",
            );
        }

        return {
            payment,
            listingId: context.listingId,
            boostPlanId: context.boostPlanId,
            isNew: true,
        };
    });
}

async function initializeNewBoostPayment(
    userId: string,
    boostId: string,
    payment: StartedPayment,
    listingId: string,
    boostPlanId: string,
): Promise<BoostPaymentResult> {
    /*
     * A new payment must have its immutable purchase snapshot.
     */
    const snapshot = getPurchaseSnapshot(payment);

    if (!snapshot) {
        throw new Error(
            "The boost payment purchase snapshot is missing or invalid.",
        );
    }

    const claim = await claimBoostPaymentInitialization(
        payment.id,
    );

    if (!claim.acquired) {
        if (claim.reason === "NOT_STARTED") {
            throw new Error(
                "This payment is no longer active. Refresh and check its status.",
            );
        }

        await safelyEnqueueReconciliation(payment.id);

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
                listingId,
                boostPlanId,
                durationDays: snapshot.durationDays,
            },
        });

        const saved = await saveBoostPaymentInitialization(
            payment.id,
            claim.token,
            gateway.data ?? gateway,
        );

        if (!saved) {
            await safelyEnqueueReconciliation(payment.id);

            throw new Error(
                "Paystack responded, but the initialization lease could not be saved. Payment reconciliation is required.",
            );
        }

        const savedPayment = await getPaymentById(
            payment.id,
        );

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
            /*
             * Notification failure must not invalidate
             * a successfully initialized payment.
             */
        }

        await safelyEnqueueReconciliation(
            savedPayment.id,
        );

        return toBoostPaymentResult(savedPayment);
    } catch (error) {
        /*
         * Do not release the initialization lease immediately.
         *
         * Paystack may have processed the request even if the
         * application received a network error.
         *
         * The lease will expire naturally, and reconciliation
         * will investigate the same reference.
         */
        await safelyEnqueueReconciliation(payment.id);

        throw error;
    }
}

async function resumeExistingBoostPayment(
    userId: string,
    payment: StartedPayment,
): Promise<BoostPaymentResult | null> {
    /*
     * Verify the existing reference before returning its
     * authorization URL.
     *
     * This also allows a late verified success to fulfill
     * an earlier payment attempt.
     */
    try {
        await verifyAndFulfillPayment(
            userId,
            payment.reference,
        );
    } catch (error) {
        if (
            error instanceof VerifiedGatewayTerminalStatusError
        ) {
            /*
             * Paystack independently confirmed FAILED or
             * ABANDONED. This session is terminal.
             *
             * Return null so the caller can create a new
             * payment with a new reference.
             */
            return null;
        }

        /*
         * A temporary verification failure must not change
         * the payment status.
         *
         * If we already have the original authorization URL,
         * preserve the session and let the user resume it.
         */
        const refreshedPayment = await getPaymentById(
            payment.id,
        );

        if (!refreshedPayment) {
            throw new Error(
                "Payment record could not be retrieved.",
            );
        }

        if (refreshedPayment.status === "SUCCESS") {
            return toBoostPaymentResult(
                refreshedPayment,
            );
        }

        if (
            refreshedPayment.status === "FAILED" ||
            refreshedPayment.status === "ABANDONED"
        ) {
            /*
             * This should normally be accompanied by the
             * typed terminal error above. Do not reuse it.
             */
            return null;
        }

        const providerData = getProviderData(
            refreshedPayment.providerData,
        );

        if (providerData?.authorization_url) {
            await safelyEnqueueReconciliation(
                refreshedPayment.id,
            );

            return toBoostPaymentResult(
                refreshedPayment,
            );
        }

        await safelyEnqueueReconciliation(
            refreshedPayment.id,
        );

        throw new Error(
            "Your existing payment is being verified. Please retry shortly. A new payment session will not be created until the previous session is resolved.",
        );
    }

    const refreshedPayment = await getPaymentById(
        payment.id,
    );

    if (!refreshedPayment) {
        throw new Error(
            "Payment record could not be retrieved after verification.",
        );
    }

    if (refreshedPayment.status === "SUCCESS") {
        return toBoostPaymentResult(
            refreshedPayment,
        );
    }

    if (
        refreshedPayment.status === "FAILED" ||
        refreshedPayment.status === "ABANDONED"
    ) {
        return null;
    }

    if (refreshedPayment.status !== "STARTED") {
        throw new Error(
            "The payment is no longer available.",
        );
    }

    const providerData = getProviderData(
        refreshedPayment.providerData,
    );

    const checkoutExpired =
        getCheckoutExpiry(refreshedPayment).getTime() <=
        Date.now();

    /*
     * Expiry alone does not prove that Paystack abandoned
     * the checkout.
     *
     * If Paystack still reports pending/ongoing, the user
     * can resume the same authorization URL.
     */
    if (providerData?.authorization_url) {
        if (checkoutExpired) {
            await safelyEnqueueReconciliation(
                refreshedPayment.id,
            );
        }

        return toBoostPaymentResult(
            refreshedPayment,
        );
    }

    /*
     * The session has no saved authorization URL.
     * Do not create another reference while this attempt
     * remains STARTED and its gateway outcome is uncertain.
     */
    await safelyEnqueueReconciliation(
        refreshedPayment.id,
    );

    throw new Error(
        "Your payment session is still being verified. Please retry shortly.",
    );
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
        throw new Error(
            "User ID and boost ID are required.",
        );
    }

    /*
     * A terminal session must not prevent a new payment.
     *
     * We retry selection after Paystack independently
     * confirms FAILED or ABANDONED.
     */
    for (
        let attempt = 0;
        attempt < MAX_SESSION_ATTEMPTS;
        attempt += 1
    ) {
        const prepared = await prepareBoostPayment(
            userId,
            boostId,
        );

        if (prepared.isNew) {
            return initializeNewBoostPayment(
                userId,
                boostId,
                prepared.payment,
                prepared.listingId,
                prepared.boostPlanId,
            );
        }

        const resumed = await resumeExistingBoostPayment(
            userId,
            prepared.payment,
        );

        if (resumed) {
            return resumed;
        }

        /*
         * The existing session was confirmed terminal.
         * The next iteration creates a fresh reference.
         */
    }

    throw new Error(
        "We could not create a new payment session after resolving the previous attempts. Please retry shortly.",
    );
}