import {
    and,
    eq,
    lte,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    paymentReconciliations,
    payments,
} from "../../../database/schema/index.ts";

/*
 * ============================================================
 * CONFIGURATION
 * ============================================================
 */

const DEFAULT_CHECKOUT_TTL_MINUTES = 30;

/*
 * Late-success recovery configuration.
 *
 * FAILED and ABANDONED payments remain eligible for
 * independent Paystack verification for 90 days.
 */
export const LATE_SUCCESS_CHECK_INTERVAL_HOURS = 24;

export const LATE_SUCCESS_RECOVERY_DAYS = 90;

/*
 * Dead-letter recovery configuration.
 */
const DEAD_LETTER_RECOVERY_HOURS = 6;

/*
 * ============================================================
 * TYPES
 * ============================================================
 */

export interface EnqueueReconciliationResult {
    paymentId: string;
    enqueued: boolean;
    reason:
        | "ENQUEUED"
        | "ALREADY_QUEUED"
        | "PAYMENT_NOT_ELIGIBLE";
}

/*
 * ============================================================
 * INITIAL ATTEMPT TIME
 * ============================================================
 */

function getInitialAttemptAt(
    payment: {
        createdAt: Date;
        checkoutExpiresAt: Date | null;
    },
): Date {
    const now = new Date();

    /*
     * Older payments may not have checkoutExpiresAt.
     *
     * Fall back to their creation time plus the
     * original 30-minute checkout lifetime.
     */
    const checkoutExpiry =
        payment.checkoutExpiresAt ??
        new Date(
            payment.createdAt.getTime() +
            DEFAULT_CHECKOUT_TTL_MINUTES * 60_000,
        );

    /*
     * Active checkout:
     * Wait until checkout expiry before reconciliation.
     *
     * Expired checkout:
     * Reconcile immediately.
     */
    return checkoutExpiry > now
        ? checkoutExpiry
        : now;
}

/*
 * ============================================================
 * RECONCILIATION RESULT HELPER
 * ============================================================
 */

function createResult(
    paymentId: string,
    enqueued: boolean,
    reason: EnqueueReconciliationResult["reason"],
): EnqueueReconciliationResult {
    return {
        paymentId,
        enqueued,
        reason,
    };
}

/*
 * ============================================================
 * RECOVER DEAD-LETTERED STARTED PAYMENTS
 * ============================================================
 */

async function recoverDeadLetteredStartedPayment(
    paymentId: string,
    reconciliationId: string,
    updatedAt: Date,
    nextAttemptAt: Date,
    now: Date,
): Promise<boolean> {
    const deadLetterCutoff = new Date(
        now.getTime() -
        DEAD_LETTER_RECOVERY_HOURS * 60 * 60_000,
    );

    if (updatedAt > deadLetterCutoff) {
        return false;
    }

    const recovered = await db
        .update(paymentReconciliations)
        .set({
            status: "PENDING",

            attemptCount: 0,

            nextAttemptAt,

            lastAttemptAt: null,

            resolvedAt: null,

            lockedBy: null,

            lockedUntil: null,

            lastErrorCode: null,

            lastErrorMessage: null,

            updatedAt: now,
        })
        .where(
            and(
                eq(
                    paymentReconciliations.id,
                    reconciliationId,
                ),
                eq(
                    paymentReconciliations.paymentId,
                    paymentId,
                ),
                eq(
                    paymentReconciliations.status,
                    "DEAD_LETTER",
                ),
                lte(
                    paymentReconciliations.updatedAt,
                    deadLetterCutoff,
                ),
            ),
        )
        .returning({
            id: paymentReconciliations.id,
        });

    return recovered.length > 0;
}

/*
 * ============================================================
 * ENQUEUE STARTED PAYMENT
 * ============================================================
 */

async function enqueueStartedPayment(
    payment: {
        id: string;
        createdAt: Date;
        checkoutExpiresAt: Date | null;
    },
    now: Date,
): Promise<EnqueueReconciliationResult> {
    const nextAttemptAt = getInitialAttemptAt(payment);

    /*
     * First attempt: create the reconciliation record.
     */
    const inserted = await db
        .insert(paymentReconciliations)
        .values({
            paymentId: payment.id,

            status: "PENDING",

            attemptCount: 0,

            nextAttemptAt,

            createdAt: now,

            updatedAt: now,
        })
        .onConflictDoNothing({
            target: paymentReconciliations.paymentId,
        })
        .returning({
            id: paymentReconciliations.id,
        });

    if (inserted.length > 0) {
        return createResult(
            payment.id,
            true,
            "ENQUEUED",
        );
    }

    /*
     * A reconciliation record already exists.
     */
    const [existing] = await db
        .select({
            id: paymentReconciliations.id,
            status: paymentReconciliations.status,
            updatedAt: paymentReconciliations.updatedAt,
        })
        .from(paymentReconciliations)
        .where(
            eq(
                paymentReconciliations.paymentId,
                payment.id,
            ),
        )
        .limit(1);

    if (!existing) {
        return createResult(
            payment.id,
            false,
            "ALREADY_QUEUED",
        );
    }

    /*
     * Recover dead-lettered STARTED payments after
     * the configured cooldown.
     */
    if (existing.status === "DEAD_LETTER") {
        const recovered =
            await recoverDeadLetteredStartedPayment(
                payment.id,
                existing.id,
                existing.updatedAt,
                nextAttemptAt,
                now,
            );

        if (recovered) {
            return createResult(
                payment.id,
                true,
                "ENQUEUED",
            );
        }
    }

    return createResult(
        payment.id,
        false,
        "ALREADY_QUEUED",
    );
}

/*
 * ============================================================
 * LATE-SUCCESS RECOVERY
 * ============================================================
 */

async function enqueueLateSuccessRecovery(
    payment: {
        id: string;
        createdAt: Date;
    },
    now: Date,
): Promise<EnqueueReconciliationResult> {
    const recoveryWindowCutoff = new Date(
        now.getTime() -
        LATE_SUCCESS_RECOVERY_DAYS * 24 * 60 * 60_000,
    );

    const lateSuccessCutoff = new Date(
        now.getTime() -
        LATE_SUCCESS_CHECK_INTERVAL_HOURS * 60 * 60_000,
    );

    const deadLetterCutoff = new Date(
        now.getTime() -
        DEAD_LETTER_RECOVERY_HOURS * 60 * 60_000,
    );

    /*
     * Stop automatic recovery after 90 days.
     */
    if (payment.createdAt < recoveryWindowCutoff) {
        return createResult(
            payment.id,
            false,
            "PAYMENT_NOT_ELIGIBLE",
        );
    }

    /*
     * Find the existing reconciliation record.
     */
    const [existing] = await db
        .select({
            id: paymentReconciliations.id,
            status: paymentReconciliations.status,
            updatedAt: paymentReconciliations.updatedAt,
            resolvedAt: paymentReconciliations.resolvedAt,
        })
        .from(paymentReconciliations)
        .where(
            eq(
                paymentReconciliations.paymentId,
                payment.id,
            ),
        )
        .limit(1);

    /*
     * A terminal payment may have been verified before
     * a reconciliation record was created.
     *
     * Create a record now so late-success recovery
     * is not permanently skipped.
     */
    if (!existing) {
        const inserted = await db
            .insert(paymentReconciliations)
            .values({
                paymentId: payment.id,

                status: "PENDING",

                attemptCount: 0,

                nextAttemptAt: now,

                createdAt: now,

                updatedAt: now,
            })
            .onConflictDoNothing({
                target: paymentReconciliations.paymentId,
            })
            .returning({
                id: paymentReconciliations.id,
            });

        if (inserted.length > 0) {
            return createResult(
                payment.id,
                true,
                "ENQUEUED",
            );
        }

        /*
         * Another process may have inserted the record
         * concurrently. Read it again below.
         */
        const [concurrentRecord] = await db
            .select({
                id: paymentReconciliations.id,
                status: paymentReconciliations.status,
                updatedAt: paymentReconciliations.updatedAt,
                resolvedAt: paymentReconciliations.resolvedAt,
            })
            .from(paymentReconciliations)
            .where(
                eq(
                    paymentReconciliations.paymentId,
                    payment.id,
                ),
            )
            .limit(1);

        if (!concurrentRecord) {
            return createResult(
                payment.id,
                false,
                "ALREADY_QUEUED",
            );
        }

        return reopenLateSuccessRecord(
            payment.id,
            concurrentRecord,
            lateSuccessCutoff,
            deadLetterCutoff,
            now,
        );
    }

    return reopenLateSuccessRecord(
        payment.id,
        existing,
        lateSuccessCutoff,
        deadLetterCutoff,
        now,
    );
}

/*
 * ============================================================
 * REOPEN LATE-SUCCESS RECORD
 * ============================================================
 */

async function reopenLateSuccessRecord(
    paymentId: string,
    existing: {
        id: string;
        status: string;
        updatedAt: Date;
        resolvedAt: Date | null;
    },
    lateSuccessCutoff: Date,
    deadLetterCutoff: Date,
    now: Date,
): Promise<EnqueueReconciliationResult> {
    /*
     * Case 1:
     * A previously resolved payment is due for its
     * next late-success verification.
     */
    const resolvedRecoveryEligible =
        existing.status === "RESOLVED" &&
        existing.resolvedAt !== null &&
        existing.resolvedAt <= lateSuccessCutoff;

    /*
     * Case 2:
     * A dead-lettered payment is due for another
     * recovery attempt after its cooldown.
     */
    const deadLetterRecoveryEligible =
        existing.status === "DEAD_LETTER" &&
        existing.updatedAt <= deadLetterCutoff;

    if (
        !resolvedRecoveryEligible &&
        !deadLetterRecoveryEligible
    ) {
        /*
         * Do not interfere with records that are:
         *
         * PENDING
         * PROCESSING
         * RETRY
         * Recently RESOLVED
         * Recently DEAD_LETTER
         */
        return createResult(
            paymentId,
            false,
            "ALREADY_QUEUED",
        );
    }

    /*
     * Atomically reopen the existing record.
     */
    const reopened = await db
        .update(paymentReconciliations)
        .set({
            status: "PENDING",

            attemptCount: 0,

            nextAttemptAt: now,

            lastAttemptAt: null,

            resolvedAt: null,

            lockedBy: null,

            lockedUntil: null,

            lastErrorCode: null,

            lastErrorMessage: null,

            updatedAt: now,
        })
        .where(
            and(
                eq(
                    paymentReconciliations.id,
                    existing.id,
                ),
                eq(
                    paymentReconciliations.paymentId,
                    paymentId,
                ),

                /*
                 * Protect against concurrent workers.
                 */
                resolvedRecoveryEligible
                    ? and(
                        eq(
                            paymentReconciliations.status,
                            "RESOLVED",
                        ),
                        lte(
                            paymentReconciliations.resolvedAt,
                            lateSuccessCutoff,
                        ),
                    )
                    : and(
                        eq(
                            paymentReconciliations.status,
                            "DEAD_LETTER",
                        ),
                        lte(
                            paymentReconciliations.updatedAt,
                            deadLetterCutoff,
                        ),
                    ),
            ),
        )
        .returning({
            id: paymentReconciliations.id,
        });

    if (reopened.length > 0) {
        return createResult(
            paymentId,
            true,
            "ENQUEUED",
        );
    }

    return createResult(
        paymentId,
        false,
        "ALREADY_QUEUED",
    );
}

/*
 * ============================================================
 * MAIN ENQUEUE FUNCTION
 * ============================================================
 */

export async function enqueuePaymentReconciliation(
    paymentId: string,
): Promise<EnqueueReconciliationResult> {
    const [payment] = await db
        .select({
            id: payments.id,
            provider: payments.provider,
            status: payments.status,
            createdAt: payments.createdAt,
            checkoutExpiresAt: payments.checkoutExpiresAt,
        })
        .from(payments)
        .where(
            eq(
                payments.id,
                paymentId,
            ),
        )
        .limit(1);

    /*
     * Only Paystack payments are eligible.
     */
    if (
        !payment ||
        payment.provider !== "PAYSTACK"
    ) {
        return createResult(
            paymentId,
            false,
            "PAYMENT_NOT_ELIGIBLE",
        );
    }

    const now = new Date();

    /*
     * STARTED payments.
     */
    if (payment.status === "STARTED") {
        return enqueueStartedPayment(
            payment,
            now,
        );
    }

    /*
     * FAILED and ABANDONED payments.
     *
     * These remain eligible for late-success recovery.
     */
    if (
        payment.status === "FAILED" ||
        payment.status === "ABANDONED"
    ) {
        return enqueueLateSuccessRecovery(
            payment,
            now,
        );
    }

    /*
     * SUCCESS payments must never be reopened.
     */
    return createResult(
        paymentId,
        false,
        "PAYMENT_NOT_ELIGIBLE",
    );
}