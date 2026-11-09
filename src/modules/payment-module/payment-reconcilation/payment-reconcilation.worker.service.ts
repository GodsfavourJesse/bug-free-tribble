import {
    and,
    eq,
    inArray,
    isNull,
    lte,
    or,
    sql,
} from "drizzle-orm";

import { randomUUID } from "node:crypto";

import { db } from "../../../database/index.ts";

import {
    paymentReconciliations,
    payments,
} from "../../../database/schema/index.ts";

import {
    verifyAndFulfillPayment,
} from "../payment.service.ts";

import {
    VerifiedGatewayTerminalStatusError,
} from "../payments_helpers/payment-fulfillment.service.ts";

/*
 * ============================================================
 * CONFIGURATION
 * ============================================================
 */

const BATCH_SIZE = 10;

const MAX_ATTEMPTS = 8;

const LEASE_DURATION_MS = 5 * 60_000;

const BASE_RETRY_DELAY_MS = 5_000;

const MAX_RETRY_DELAY_MS = 15 * 60_000;

/*
 * ============================================================
 * TYPES
 * ============================================================
 */

type ClaimedReconciliation = {
    id: string;
    paymentId: string;
    attemptCount: number;
};

export type PaymentReconciliationWorkerResult = {
    workerId: string;
    claimed: number;
    resolved: number;
    retryScheduled: number;
    deadLettered: number;
    ignored: number;
    lostLease: number;
};

/*
 * ============================================================
 * ERROR HANDLING
 * ============================================================
 */

function safeErrorMessage(
    error: unknown,
): string {
    const message =
        error instanceof Error
            ? error.message
            : "Unknown reconciliation error.";

    return message.slice(0, 2_000);
}

function safeErrorCode(
    error: unknown,
): string {
    const message =
        safeErrorMessage(error).toLowerCase();

    if (message.includes("amount mismatch")) {
        return "AMOUNT_MISMATCH";
    }

    if (message.includes("currency mismatch")) {
        return "CURRENCY_MISMATCH";
    }

    if (message.includes("reference mismatch")) {
        return "REFERENCE_MISMATCH";
    }

    if (message.includes("payment not found")) {
        return "PAYMENT_NOT_FOUND";
    }

    if (message.includes("not successful")) {
        return "PAYMENT_NOT_CONFIRMED";
    }

    if (
        message.includes("timeout") ||
        message.includes("timed out")
    ) {
        return "PAYSTACK_TIMEOUT";
    }

    if (
        message.includes("network") ||
        message.includes("econn") ||
        message.includes("socket")
    ) {
        return "NETWORK_ERROR";
    }

    if (message.includes("paystack")) {
        return "PAYSTACK_VERIFICATION_ERROR";
    }

    return "RECONCILIATION_FAILED";
}

/*
 * ============================================================
 * RETRY DELAY
 * ============================================================
 */

function calculateRetryDelayMs(
    attemptCount: number,
): number {
    const exponent = Math.max(
        0,
        attemptCount - 1,
    );

    const exponentialDelay = Math.min(
        MAX_RETRY_DELAY_MS,
        BASE_RETRY_DELAY_MS * 2 ** exponent,
    );

    const jitter =
        Math.random() * exponentialDelay * 0.2;

    return Math.min(
        MAX_RETRY_DELAY_MS,
        Math.floor(
            exponentialDelay + jitter,
        ),
    );
}

/*
 * ============================================================
 * CLAIM RECONCILIATION RECORDS
 * ============================================================
 */

async function claimReconciliationRecords(
    workerId: string,
): Promise<ClaimedReconciliation[]> {
    const now = new Date();

    const leaseExpiry = new Date(
        now.getTime() + LEASE_DURATION_MS,
    );

    return db.transaction(async (tx) => {
        const candidates = await tx
            .select({
                id: paymentReconciliations.id,
                paymentId: paymentReconciliations.paymentId,
                attemptCount:
                    paymentReconciliations.attemptCount,
            })
            .from(paymentReconciliations)
            .where(
                and(
                    or(
                        /*
                         * Pending and retry records.
                         */
                        and(
                            inArray(
                                paymentReconciliations.status,
                                [
                                    "PENDING",
                                    "RETRY",
                                ],
                            ),
                            lte(
                                paymentReconciliations.nextAttemptAt,
                                now,
                            ),
                        ),

                        /*
                         * Recover records whose worker lease
                         * expired before processing completed.
                         */
                        and(
                            eq(
                                paymentReconciliations.status,
                                "PROCESSING",
                            ),
                            or(
                                isNull(
                                    paymentReconciliations.lockedUntil,
                                ),
                                lte(
                                    paymentReconciliations.lockedUntil,
                                    now,
                                ),
                            ),
                        ),
                    ),
                ),
            )
            .orderBy(
                paymentReconciliations.nextAttemptAt,
            )
            .limit(BATCH_SIZE)
            .for("update", {
                skipLocked: true,
            });

        if (candidates.length === 0) {
            return [];
        }

        const ids = candidates.map(
            (record) => record.id,
        );

        return tx
            .update(paymentReconciliations)
            .set({
                status: "PROCESSING",

                attemptCount: sql`
                    ${paymentReconciliations.attemptCount} + 1
                `,

                lastAttemptAt: now,

                lockedBy: workerId,

                lockedUntil: leaseExpiry,

                updatedAt: now,
            })
            .where(
                inArray(
                    paymentReconciliations.id,
                    ids,
                ),
            )
            .returning({
                id: paymentReconciliations.id,
                paymentId: paymentReconciliations.paymentId,
                attemptCount:
                    paymentReconciliations.attemptCount,
            });
    });
}

/*
 * ============================================================
 * FINALIZE RECONCILIATION
 * ============================================================
 */

async function finalizeRecord(
    record: ClaimedReconciliation,
    workerId: string,
    status: "RESOLVED" | "IGNORED",
): Promise<boolean> {
    const now = new Date();

    const updated = await db
        .update(paymentReconciliations)
        .set({
            status,

            resolvedAt:
                status === "RESOLVED"
                    ? now
                    : null,

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
                    record.id,
                ),
                eq(
                    paymentReconciliations.status,
                    "PROCESSING",
                ),
                eq(
                    paymentReconciliations.lockedBy,
                    workerId,
                ),
            ),
        )
        .returning({
            id: paymentReconciliations.id,
        });

    return updated.length > 0;
}

/*
 * ============================================================
 * RETRY OR DEAD LETTER
 * ============================================================
 */

async function scheduleRetry(
    record: ClaimedReconciliation,
    workerId: string,
    error: unknown,
): Promise<
    | "RETRY"
    | "DEAD_LETTER"
    | "LEASE_LOST"
> {
    const now = new Date();

    const deadLettered =
        record.attemptCount >= MAX_ATTEMPTS;

    const nextAttemptAt = deadLettered
        ? now
        : new Date(
            now.getTime() +
            calculateRetryDelayMs(
                record.attemptCount,
            ),
        );

    const updated = await db
        .update(paymentReconciliations)
        .set({
            status: deadLettered
                ? "DEAD_LETTER"
                : "RETRY",

            nextAttemptAt,

            lockedBy: null,

            lockedUntil: null,

            lastErrorCode: safeErrorCode(error),

            lastErrorMessage: safeErrorMessage(error),

            updatedAt: now,
        })
        .where(
            and(
                eq(
                    paymentReconciliations.id,
                    record.id,
                ),
                eq(
                    paymentReconciliations.status,
                    "PROCESSING",
                ),
                eq(
                    paymentReconciliations.lockedBy,
                    workerId,
                ),
            ),
        )
        .returning({
            id: paymentReconciliations.id,
        });

    if (updated.length === 0) {
        return "LEASE_LOST";
    }

    return deadLettered
        ? "DEAD_LETTER"
        : "RETRY";
}

/*
 * ============================================================
 * READ CURRENT PAYMENT STATUS
 * ============================================================
 */

async function getCurrentPaymentStatus(
    paymentId: string,
) {
    const [payment] = await db
        .select({
            status: payments.status,
        })
        .from(payments)
        .where(
            eq(
                payments.id,
                paymentId,
            ),
        )
        .limit(1);

    return payment?.status ?? null;
}

/*
 * ============================================================
 * PROCESS ONE RECONCILIATION
 * ============================================================
 */

async function processReconciliation(
    record: ClaimedReconciliation,
    workerId: string,
): Promise<
    | "RESOLVED"
    | "RETRY"
    | "DEAD_LETTER"
    | "IGNORED"
    | "LEASE_LOST"
> {
    /*
     * Load the associated payment.
     */
    let payment: {
        id: string;
        userId: string;
        reference: string;
        provider: string;
        status: string;
    } | undefined;

    try {
        const [result] = await db
            .select({
                id: payments.id,
                userId: payments.userId,
                reference: payments.reference,
                provider: payments.provider,
                status: payments.status,
            })
            .from(payments)
            .where(
                eq(
                    payments.id,
                    record.paymentId,
                ),
            )
            .limit(1);

        payment = result;
    } catch (error: unknown) {
        return scheduleRetry(
            record,
            workerId,
            error,
        );
    }

    /*
     * Missing payment.
     */
    if (!payment) {
        const updated = await finalizeRecord(
            record,
            workerId,
            "IGNORED",
        );

        return updated
            ? "IGNORED"
            : "LEASE_LOST";
    }

    /*
     * Unsupported payment provider.
     */
    if (payment.provider !== "PAYSTACK") {
        const updated = await finalizeRecord(
            record,
            workerId,
            "IGNORED",
        );

        return updated
            ? "IGNORED"
            : "LEASE_LOST";
    }

    /*
     * Already successful.
     *
     * No additional Paystack verification is necessary.
     */
    if (payment.status === "SUCCESS") {
        const updated = await finalizeRecord(
            record,
            workerId,
            "RESOLVED",
        );

        return updated
            ? "RESOLVED"
            : "LEASE_LOST";
    }

    /*
     * Verify the transaction independently with Paystack.
     *
     * This intentionally includes:
     * STARTED
     * FAILED
     * ABANDONED
     *
     * FAILED and ABANDONED are checked because a late
     * independently verified success must still be accepted.
     */
    let verificationError: unknown = null;

    try {
        await verifyAndFulfillPayment(
            payment.userId,
            payment.reference,
        );
    } catch (error: unknown) {
        verificationError = error;
    }

    /*
     * Read the authoritative database status after verification.
     */
    let currentStatus: string | null;

    try {
        currentStatus = await getCurrentPaymentStatus(
            payment.id,
        );
    } catch (error: unknown) {
        return scheduleRetry(
            record,
            workerId,
            error,
        );
    }

    /*
     * SUCCESS always wins.
     *
     * This also handles a successful fulfillment that completed
     * even if a subsequent operation threw an error.
     */
    if (currentStatus === "SUCCESS") {
        const updated = await finalizeRecord(
            record,
            workerId,
            "RESOLVED",
        );

        return updated
            ? "RESOLVED"
            : "LEASE_LOST";
    }

    /*
     * Only a typed, independently verified Paystack terminal
     * result can resolve FAILED or ABANDONED payments.
     *
     * A generic exception is never enough to terminalize
     * or resolve a payment.
     */
    if (
        verificationError instanceof
            VerifiedGatewayTerminalStatusError &&
        (
            currentStatus === "FAILED" ||
            currentStatus === "ABANDONED"
        )
    ) {
        const updated = await finalizeRecord(
            record,
            workerId,
            "RESOLVED",
        );

        return updated
            ? "RESOLVED"
            : "LEASE_LOST";
    }

    /*
     * Pending, ongoing, processing, network errors,
     * provider errors, and unexpected outcomes all retry.
     *
     * A locally expired checkout is not sufficient evidence
     * that Paystack abandoned the transaction.
     */
    return scheduleRetry(
        record,
        workerId,
        verificationError ??
            new Error(
                "Paystack verification did not resolve the payment.",
            ),
    );
}

/*
 * ============================================================
 * RUN ONE BATCH
 * ============================================================
 */

export async function processPaymentReconciliationBatch(): Promise<PaymentReconciliationWorkerResult> {
    const workerId = randomUUID();

    const result: PaymentReconciliationWorkerResult = {
        workerId,
        claimed: 0,
        resolved: 0,
        retryScheduled: 0,
        deadLettered: 0,
        ignored: 0,
        lostLease: 0,
    };

    const records = await claimReconciliationRecords(
        workerId,
    );

    result.claimed = records.length;

    /*
     * Process claimed records concurrently.
     *
     * All records begin processing immediately, instead
     * of waiting behind previous Paystack requests.
     */
    const outcomes = await Promise.all(
        records.map(async (record) => {
            try {
                return await processReconciliation(
                    record,
                    workerId,
                );
            } catch (error: unknown) {
                /*
                 * An unexpected error must not prevent
                 * other records from completing.
                 */
                try {
                    return await scheduleRetry(
                        record,
                        workerId,
                        error,
                    );
                } catch {
                    return "LEASE_LOST" as const;
                }
            }
        }),
    );

    for (const outcome of outcomes) {
        switch (outcome) {
            case "RESOLVED":
                result.resolved += 1;
                break;

            case "RETRY":
                result.retryScheduled += 1;
                break;

            case "DEAD_LETTER":
                result.deadLettered += 1;
                break;

            case "IGNORED":
                result.ignored += 1;
                break;

            case "LEASE_LOST":
                result.lostLease += 1;
                break;
        }
    }

    return result;
}