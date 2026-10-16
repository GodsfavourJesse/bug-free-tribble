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

/*
 * ============================================================
 * CONFIGURATION
 * ============================================================
 */

const BATCH_SIZE = 10;

const MAX_ATTEMPTS = 8;

const LEASE_DURATION_MS = 60_000;

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

function safeErrorMessage(error: unknown): string {
    const message =
        error instanceof Error
            ? error.message
            : "Unknown reconciliation error.";

    return message.slice(0, 2_000);
}

function safeErrorCode(error: unknown): string {
    const message = safeErrorMessage(error).toLowerCase();

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

    if (message.includes("paystack")) {
        return "PAYSTACK_VERIFICATION_ERROR";
    }

    return "RECONCILIATION_FAILED";
}

function calculateRetryDelayMs(
    attemptCount: number,
): number {
    const exponent = Math.max(0, attemptCount - 1);

    const exponentialDelay = Math.min(
        MAX_RETRY_DELAY_MS,
        BASE_RETRY_DELAY_MS * 2 ** exponent,
    );

    const jitter = Math.random() * exponentialDelay * 0.2;

    return Math.min(
        MAX_RETRY_DELAY_MS,
        Math.floor(exponentialDelay + jitter),
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
                attemptCount: paymentReconciliations.attemptCount,
            })
            .from(paymentReconciliations)
            .where(
                and(
                    inArray(
                        paymentReconciliations.status,
                        [
                            "PENDING",
                            "RETRY",
                            "PROCESSING",
                        ],
                    ),
                    or(
                        and(
                            eq(
                                paymentReconciliations.status,
                                "PENDING",
                            ),
                            and(
                                eq(
                                    paymentReconciliations.status,
                                    "RETRY",
                                ),
                                lte(
                                    paymentReconciliations.nextAttemptAt,
                                    now,
                                ),
                            ),
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
                ),
            )
            .orderBy(
                sql`${paymentReconciliations.nextAttemptAt} ASC`,
            )
            .limit(BATCH_SIZE)
            .for("update", {
                skipLocked: true,
            });

        if (candidates.length === 0) {
            return [];
        }

        const ids = candidates.map((record) => record.id);

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
                attemptCount: paymentReconciliations.attemptCount,
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

            resolvedAt: status === "RESOLVED" ? now : null,

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
 * SCHEDULE RETRY OR DEAD LETTER
 * ============================================================
 */

async function scheduleRetry(
    record: ClaimedReconciliation,
    workerId: string,
    error: unknown,
): Promise<"RETRY" | "DEAD_LETTER" | "LEASE_LOST"> {
    const now = new Date();

    const deadLettered =
        record.attemptCount >= MAX_ATTEMPTS;

    const nextAttemptAt = deadLettered
        ? now
        : new Date(
              now.getTime() +
                  calculateRetryDelayMs(record.attemptCount),
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
 * PROCESS ONE RECONCILIATION
 * ============================================================
 */

async function processReconciliation(
    record: ClaimedReconciliation,
    workerId: string,
): Promise<
    "RESOLVED" |
    "RETRY" |
    "DEAD_LETTER" |
    "IGNORED" |
    "LEASE_LOST"
> {
    try {
        const [payment] = await db
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
         * A webhook or another verification request may already
         * have fulfilled this payment.
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
         * Terminal payment states do not need further verification.
         */
        if (
            payment.status === "FAILED" ||
            payment.status === "ABANDONED" ||
            payment.status === "REVERSED"
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
         * The existing fulfillment service verifies the transaction
         * directly with Paystack and performs idempotent fulfillment.
         */
        try {
            await verifyAndFulfillPayment(
                payment.userId,
                payment.reference,
            );
        } catch (error: unknown) {
            /*
             * Notification delivery may throw after fulfillment
             * commits. Always inspect the database before deciding
             * whether to retry.
             */
            const [freshPayment] = await db
                .select({
                    status: payments.status,
                })
                .from(payments)
                .where(
                    eq(
                        payments.id,
                        payment.id,
                    ),
                )
                .limit(1);

            if (freshPayment?.status === "SUCCESS") {
                const updated = await finalizeRecord(
                    record,
                    workerId,
                    "RESOLVED",
                );

                return updated
                    ? "RESOLVED"
                    : "LEASE_LOST";
            }

            if (
                freshPayment &&
                (
                    freshPayment.status === "FAILED" ||
                    freshPayment.status === "ABANDONED" ||
                    freshPayment.status === "REVERSED"
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

            return scheduleRetry(
                record,
                workerId,
                error,
            );
        }

        const [freshPayment] = await db
            .select({
                status: payments.status,
            })
            .from(payments)
            .where(
                eq(
                    payments.id,
                    payment.id,
                ),
            )
            .limit(1);

        if (freshPayment?.status === "SUCCESS") {
            const updated = await finalizeRecord(
                record,
                workerId,
                "RESOLVED",
            );

            return updated
                ? "RESOLVED"
                : "LEASE_LOST";
        }

        return scheduleRetry(
            record,
            workerId,
            new Error(
                "Paystack verification did not resolve the payment.",
            ),
        );
    } catch (error: unknown) {
        return scheduleRetry(
            record,
            workerId,
            error,
        );
    }
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

    for (const record of records) {
        const outcome = await processReconciliation(
            record,
            workerId,
        );

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