import {
    and,
    asc,
    eq,
    isNull,
    lt,
    lte,
    or,
    sql,
} from "drizzle-orm";

import { randomUUID } from "node:crypto";

import { isPaystackConfigured } from "../../../config/env.ts";
import { db } from "../../../database/index.ts";
import { payments } from "../../../database/schema/index.ts";

import {
    createPendingSubscriptionInTransaction,
    recordSubscriptionHistoryEvent,
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

import {
    verifyAndFulfillPayment,
    VerifiedGatewayTerminalStatusError,
} from "./payment-fulfillment.service.ts";

import type {
    SubscriptionPaymentResult,
} from "../payment.types.ts";


const CHECKOUT_TTL_MINUTES = 30;

const INITIALIZATION_LEASE_MS = 90_000;

const MAX_SESSION_RECOVERY_ATTEMPTS = 3;


type SubscriptionPayment = typeof payments.$inferSelect;


type PaymentSelection = {
    payment: SubscriptionPayment;
    created: boolean;
};


function getCheckoutExpiry(
    payment: SubscriptionPayment,
): Date {
    return payment.checkoutExpiresAt ?? new Date(
        payment.createdAt.getTime() +
        CHECKOUT_TTL_MINUTES * 60_000,
    );
}


/**
 * Builds a consistent response for both new and resumed
 * subscription payment sessions.
 */
function toSubscriptionPaymentResult(
    payment: SubscriptionPayment,
    subscriptionId: string,
): SubscriptionPaymentResult {
    const providerData = getProviderData(
        payment.providerData,
    );

    const authorizationUrl =
        payment.status === "STARTED"
            ? providerData?.authorization_url
            : undefined;

    const accessCode =
        payment.status === "STARTED"
            ? providerData?.access_code
            : undefined;

    return {
        paymentId: payment.id,
        subscriptionId,
        reference: payment.reference,

        status: payment.status,

        canResume:
            payment.status === "STARTED" &&
            Boolean(authorizationUrl),

        ...(authorizationUrl
            ? { authorizationUrl }
            : {}),

        ...(accessCode
            ? { accessCode }
            : {}),

        amount: Number(payment.amount),

        currency: payment.currency,

        dealerDiscountPercent: Number(
            payment.discountPercent,
        ),
    };
}


/**
 * Retrieves the latest database state.
 *
 * Never rely on an old payment object after verification,
 * because the verification process may have changed its status.
 */
async function getPaymentById(
    paymentId: string,
): Promise<SubscriptionPayment | undefined> {
    const [payment] = await db
        .select()
        .from(payments)
        .where(
            eq(
                payments.id,
                paymentId,
            ),
        )
        .limit(1);

    return payment;
}


/**
 * Serializes subscription payment creation.
 *
 * Only one STARTED payment session can exist for a
 * subscription at a time.
 *
 * Terminal sessions do not prevent a new payment.
 */
async function selectOrCreateSubscriptionPayment(
    userId: string,
    subscription: Awaited<
        ReturnType<typeof createPendingSubscriptionInTransaction>
    >,
): Promise<PaymentSelection> {
    const reference = createPaymentReference(
        "KARMASS-SUB",
    );

    const now = new Date();

    const checkoutExpiresAt = new Date(
        now.getTime() +
        CHECKOUT_TTL_MINUTES * 60_000,
    );

    return db.transaction(async (tx) => {
        await tx.execute(sql`
            SELECT pg_advisory_xact_lock(
                hashtextextended(
                    ${`karmass:subscription-payment:${subscription.id}`},
                    0
                )
            )
        `);

        const existingRows = await tx
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
                        "STARTED",
                    ),
                ),
            )
            .orderBy(
                asc(payments.createdAt),
            )
            .limit(1);

        const existingPayment = existingRows[0];

        if (existingPayment) {
            return {
                payment: existingPayment,
                created: false,
            };
        }

        const insertedRows = await tx
            .insert(payments)
            .values({
                userId,

                purpose: "SUBSCRIPTION",

                status: "STARTED",

                reference,

                provider: "PAYSTACK",

                // The actual amount the customer must pay.
                amount: subscription.effectivePrice,

                // Original plan price before discount.
                originalAmount: subscription.originalPrice,

                // The discount actually applied to this customer.
                discountPercent: subscription.appliedDiscountPercent,

                discountAmount: (
                    Number(subscription.originalPrice) -
                    Number(subscription.effectivePrice)
                ).toFixed(2),

                currency: subscription.currency,

                subscriptionId: subscription.id,

                checkoutExpiresAt,

                providerData: {
                    subscriptionId: subscription.id,

                    planId: subscription.planId,

                    planVersionId: subscription.planVersionId,

                    pricingSnapshot: {
                        originalPrice: subscription.originalPrice,

                        normalUserDiscountPercent:
                            subscription.normalUserDiscountPercent,

                        dealerDiscountPercent:
                            subscription.dealerDiscountPercent,

                        appliedDiscountPercent:
                            subscription.appliedDiscountPercent,

                        effectivePrice: subscription.effectivePrice,

                        currency: subscription.currency,
                    },
                },
            })
            .returning();

        const insertedPayment = insertedRows[0];

        if (!insertedPayment) {
            throw new Error(
                "Unable to create payment record.",
            );
        }

        await recordSubscriptionHistoryEvent(tx, {
            subscriptionId: subscription.id,
            userId,
            event: "PAYMENT_PENDING",
            newStatus: "PENDING",
            amount: insertedPayment.amount,
            currency: insertedPayment.currency,
            reason: "Subscription payment initialized.",
            metadata: JSON.stringify({
                paymentId: insertedPayment.id,
                paymentReference: insertedPayment.reference,
                provider: "PAYSTACK",
            }),
        });

        return {
            payment: insertedPayment,
            created: true,
        };
    });
}


/**
 * Claims the initialization lease for a payment.
 *
 * The lease prevents multiple requests from initializing
 * the same payment reference simultaneously.
 */
async function claimSubscriptionInitialization(
    paymentId: string,
): Promise<string | null> {
    const now = new Date();

    const token = randomUUID();

    const claimed = await db
        .update(payments)
        .set({
            initializationToken: token,

            initializationExpiresAt: new Date(
                now.getTime() +
                INITIALIZATION_LEASE_MS,
            ),

            updatedAt: now,
        })
        .where(
            and(
                eq(
                    payments.id,
                    paymentId,
                ),

                eq(
                    payments.purpose,
                    "SUBSCRIPTION",
                ),

                eq(
                    payments.status,
                    "STARTED",
                ),

                or(
                    isNull(
                        payments.initializationExpiresAt,
                    ),

                    lte(
                        payments.initializationExpiresAt,
                        now,
                    ),
                ),
            ),
        )
        .returning({
            id: payments.id,
        });

    return claimed[0] ? token : null;
}


/**
 * Saves the Paystack initialization response.
 *
 * Existing internal metadata is preserved, including
 * the original subscription pricing snapshot.
 */
async function saveSubscriptionInitialization(
    payment: SubscriptionPayment,
    token: string,
    gatewayResponse: unknown,
): Promise<SubscriptionPayment | undefined> {
    const existingProviderData = getProviderData(
        payment.providerData,
    );

    const gatewayData =
        gatewayResponse &&
        typeof gatewayResponse === "object"
            ? gatewayResponse as Record<string, unknown>
            : {};

    const providerData = {
        ...gatewayData,

        ...existingProviderData,

        paymentId: payment.id,

        subscriptionId: payment.subscriptionId,
    };

    const updated = await db
        .update(payments)
        .set({
            providerData,

            initializationToken: null,

            initializationExpiresAt: null,

            updatedAt: new Date(),
        })
        .where(
            and(
                eq(
                    payments.id,
                    payment.id,
                ),

                eq(
                    payments.purpose,
                    "SUBSCRIPTION",
                ),

                eq(
                    payments.status,
                    "STARTED",
                ),

                eq(
                    payments.initializationToken,
                    token,
                ),
            ),
        )
        .returning();

    return updated[0];
}


/**
 * Schedules reconciliation without allowing queue errors
 * to invalidate an otherwise valid payment operation.
 */
async function safelyEnqueueReconciliation(
    paymentId: string,
): Promise<void> {
    try {
        await enqueuePaymentReconciliation(
            paymentId,
        );
    } catch {
        // Periodic reconciliation discovery is the fallback.
    }
}


/**
 * Handles an existing STARTED subscription payment.
 *
 * Behaviour:
 *
 * SUCCESS:
 *   Return the successfully fulfilled payment.
 *
 * FAILED / ABANDONED:
 *   Return null so a new payment session can be created.
 *
 * PENDING / ONGOING / temporary verification errors:
 *   Preserve the existing payment session and return
 *   its existing checkout URL when available.
 */
async function initializeExistingSubscriptionPayment(
    payment: SubscriptionPayment,
    subscriptionId: string,
    userId: string,
): Promise<SubscriptionPaymentResult | null> {
    if (payment.status !== "STARTED") {
        throw new Error(
            "This payment session is no longer active.",
        );
    }

    const providerData = getProviderData(
        payment.providerData,
    );

    const authorizationUrl =
        providerData?.authorization_url;

    const checkoutExpiry = getCheckoutExpiry(
        payment,
    );

    const checkoutExpired =
        checkoutExpiry.getTime() <= Date.now();

    /*
     * Do not attempt another initialization while
     * another request owns the initialization lease.
     */
    if (
        payment.initializationToken &&
        payment.initializationExpiresAt &&
        payment.initializationExpiresAt.getTime() > Date.now()
    ) {
        if (authorizationUrl) {
            return toSubscriptionPaymentResult(
                payment,
                subscriptionId,
            );
        }

        throw new Error(
            "Your payment checkout is being initialized. Please retry shortly.",
        );
    }

    /*
     * Always verify an existing session before resuming it.
     */
    try {
        await verifyAndFulfillPayment(
            userId,
            payment.reference,
        );

        const latestPayment = await getPaymentById(
            payment.id,
        );

        if (!latestPayment) {
            throw new Error(
                "Unable to retrieve the verified payment.",
            );
        }

        if (latestPayment.status === "SUCCESS") {
            return toSubscriptionPaymentResult(
                latestPayment,
                subscriptionId,
            );
        }

        if (
            latestPayment.status === "FAILED" ||
            latestPayment.status === "ABANDONED"
        ) {
            return null;
        }

        if (latestPayment.status !== "STARTED") {
            throw new Error(
                "The payment session has an unexpected status.",
            );
        }

        /*
         * A non-terminal gateway response means the
         * original payment session remains active.
         */
        if (checkoutExpired) {
            await safelyEnqueueReconciliation(
                payment.id,
            );
        }

        const latestProviderData = getProviderData(
            latestPayment.providerData,
        );

        if (latestProviderData?.authorization_url) {
            return toSubscriptionPaymentResult(
                latestPayment,
                subscriptionId,
            );
        }

        throw new Error(
            "Your payment is still being processed. We could not retrieve its checkout link. Please retry shortly.",
        );

    } catch (error) {

        /*
         * These errors mean Paystack independently confirmed
         * that the previous payment session is terminal.
         *
         * A new payment reference may now be created.
         */
        if (
            error instanceof VerifiedGatewayTerminalStatusError
        ) {
            return null;
        }

        /*
         * A temporary verification error must NEVER cause
         * a new payment reference to be created.
         *
         * If the original checkout URL exists, let the user
         * resume that same session.
         */
        if (authorizationUrl) {
            if (checkoutExpired) {
                await safelyEnqueueReconciliation(
                    payment.id,
                );
            }

            return toSubscriptionPaymentResult(
                payment,
                subscriptionId,
            );
        }

        /*
         * No checkout URL is available. Preserve the
         * existing payment rather than creating another one.
         */
        await safelyEnqueueReconciliation(
            payment.id,
        );

        throw error;
    }
}


/**
 * Initializes a newly created subscription payment.
 */
async function initializeNewSubscriptionPayment(
    payment: SubscriptionPayment,
    subscriptionId: string,
    userId: string,
    planId: string,
    planVersionId: string,
    appliedDiscountPercent: number,
): Promise<SubscriptionPaymentResult> {
    const token = await claimSubscriptionInitialization(
        payment.id,
    );

    if (!token) {
        throw new Error(
            "Unable to claim payment initialization. Please retry shortly.",
        );
    }

    /*
     * These operations happen before contacting Paystack.
     *
     * If either operation fails, we can safely release the
     * initialization lease because no gateway request was made.
     */
    let email: string;
    let amountSubunit: number;

    try {
        email = await getUserEmail(userId);

        amountSubunit = amountToSubunit(
            Number(payment.amount),
            payment.currency,
        );
    } catch (error) {
        await db
            .update(payments)
            .set({
                initializationToken: null,
                initializationExpiresAt: null,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(payments.id, payment.id),
                    eq(payments.initializationToken, token),
                    eq(payments.status, "STARTED"),
                ),
            );

        throw error;
    }

    try {
        /*
         * Contact Paystack.
         *
         * From this point onward, an error may be ambiguous:
         * Paystack might have accepted the request even if our
         * application did not receive or save its response.
         *
         * Therefore, do not release the initialization lease here.
         */
        const gateway = await initializePaystackTransaction({
            email,
            amountSubunit,
            currency: payment.currency,
            reference: payment.reference,
            metadata: {
                paymentId: payment.id,
                purpose: "SUBSCRIPTION",
                subscriptionId,
                planId,
                planVersionId,
                appliedDiscountPercent,
            },
        });

        const savedPayment = await saveSubscriptionInitialization(
            payment,
            token,
            gateway.data ?? gateway,
        );

        if (!savedPayment) {
            throw new Error(
                "Paystack responded, but the payment initialization could not be saved. Reconciliation is required.",
            );
        }

        /*
         * Queue reconciliation after successful initialization.
         * This allows the system to independently verify the
         * payment even if the customer leaves checkout.
         */
        await safelyEnqueueReconciliation(
            payment.id,
        );

        /*
         * Notifications must never invalidate a successfully
         * initialized payment session.
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
                    reference: payment.reference,
                    subscriptionId,
                    amount: Number(payment.amount),
                    currency: payment.currency,
                },
            });
        } catch {
            // Notification failure must not invalidate payment initialization.
        }

        return toSubscriptionPaymentResult(
            savedPayment,
            subscriptionId,
        );
    } catch (error) {
        /*
         * The Paystack request may have succeeded even if a later
         * operation failed. Keep the lease and enqueue reconciliation.
         *
         * Do not mark the payment FAILED or ABANDONED here.
         * Do not create another payment reference here.
         */
        await safelyEnqueueReconciliation(
            payment.id,
        );

        throw error;
    }
}


/**
 * Public subscription payment initialization.
 *
 * This function:
 *
 * 1. Finds or creates the pending subscription.
 * 2. Reuses an existing STARTED payment only after verification.
 * 3. Resumes an existing non-terminal checkout.
 * 4. Creates a fresh payment reference after verified
 *    FAILED or ABANDONED responses.
 */
export async function initializeSubscriptionPayment(
    userId: string,
    planId: string,
): Promise<SubscriptionPaymentResult> {
    if (!isPaystackConfigured()) {
        throw new Error(
            "Payments are not configured yet. Add PAYSTACK_SECRET_KEY first.",
        );
    }

    const subscription = await db.transaction(async (tx) =>
        createPendingSubscriptionInTransaction(
            {
                userId,
                planId,
            },
            tx,
        ),
    );

    /*
     * Retry selection if another concurrent request creates
     * a new STARTED payment while we are verifying an older one.
     */
    for (
        let attempt = 0;
        attempt < MAX_SESSION_RECOVERY_ATTEMPTS;
        attempt += 1
    ) {
        const selection = await selectOrCreateSubscriptionPayment(
            userId,
            subscription,
        );

        const payment = selection.payment;

        if (selection.created) {

            /*
             * Record PAYMENT_PENDING only when a new payment
             * session is actually created.
             */
            // await db.transaction(async (tx) => {
            //     await recordSubscriptionHistoryEvent(tx, {
            //         subscriptionId: subscription.id,

            //         userId,

            //         event: "PAYMENT_PENDING",

            //         newStatus: "PENDING",

            //         amount: payment.amount,

            //         currency: payment.currency,

            //         reason: "Subscription payment initialized.",

            //         metadata: JSON.stringify({
            //             paymentId: payment.id,

            //             paymentReference: payment.reference,

            //             provider: "PAYSTACK",
            //         }),
            //     });
            // });

            return initializeNewSubscriptionPayment(
                payment,
                subscription.id,
                userId,
                subscription.planId,
                subscription.planVersionId,
                Number(subscription.appliedDiscountPercent),
            );
        }

        /*
         * Existing payment: verify before deciding whether
         * to resume it or create another session.
         */
        const existingResult =
            await initializeExistingSubscriptionPayment(
                payment,
                subscription.id,
                userId,
            );

        if (existingResult) {
            return existingResult;
        }

        /*
         * null means Paystack confirmed FAILED or ABANDONED.
         *
         * The next iteration creates a fresh payment reference,
         * provided another concurrent request hasn't already
         * created a new STARTED session.
         */
    }

    throw new Error(
        "We could not establish a new payment session. Please try again shortly.",
    );
}