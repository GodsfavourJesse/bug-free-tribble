import {
    and,
    eq,
    gte,
    isNotNull,
    isNull,
    lt,
    lte,
    or,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    paymentReconciliations,
    payments,
} from "../../../database/schema/index.ts";

import {
    enqueuePaymentReconciliation,
    LATE_SUCCESS_CHECK_INTERVAL_HOURS,
    LATE_SUCCESS_RECOVERY_DAYS,
} from "./payment-reconcilation.enqueue.service.ts";

const DEFAULT_BATCH_SIZE = 100;

const MAX_BATCH_SIZE = 500;

const DEFAULT_MINIMUM_AGE_MINUTES = 30;

const MAX_MINIMUM_AGE_MINUTES = 24 * 60;

/*
 * Dead-lettered payments are periodically reconsidered.
 */
const DEAD_LETTER_RECOVERY_HOURS = 6;

export interface DiscoverReconciliationOptions {
    batchSize?: number;
    minimumAgeMinutes?: number;
}

export interface DiscoverReconciliationResult {
    examined: number;
    enqueued: number;
    skipped: number;
}

function normalizeInteger(
    value: number | undefined,
    defaultValue: number,
    maximum: number,
): number {
    if (
        value === undefined ||
        !Number.isFinite(value)
    ) {
        return defaultValue;
    }

    return Math.min(
        maximum,
        Math.max(
            1,
            Math.floor(value),
        ),
    );
}

/*
 * ============================================================
 * DISCOVER ELIGIBLE PAYMENTS
 * ============================================================
 */

export async function discoverPaymentsForReconciliation(
    options: DiscoverReconciliationOptions = {},
): Promise<DiscoverReconciliationResult> {
    const batchSize = normalizeInteger(
        options.batchSize,
        DEFAULT_BATCH_SIZE,
        MAX_BATCH_SIZE,
    );

    const minimumAgeMinutes = normalizeInteger(
        options.minimumAgeMinutes,
        DEFAULT_MINIMUM_AGE_MINUTES,
        MAX_MINIMUM_AGE_MINUTES,
    );

    const now = new Date();

    const legacyCutoff = new Date(
        now.getTime() -
        minimumAgeMinutes * 60_000,
    );

    const deadLetterCutoff = new Date(
        now.getTime() -
        DEAD_LETTER_RECOVERY_HOURS * 60 * 60_000,
    );

    /*
     * Previously resolved terminal payments are checked
     * again after the configured interval.
     */
    const lateSuccessCutoff = new Date(
        now.getTime() -
        LATE_SUCCESS_CHECK_INTERVAL_HOURS * 60 * 60_000,
    );

    /*
     * Do not continue automatic late-success recovery
     * indefinitely.
     */
    const recoveryWindowCutoff = new Date(
        now.getTime() -
        LATE_SUCCESS_RECOVERY_DAYS * 24 * 60 * 60_000,
    );

    const candidates = await db
        .select({
            id: payments.id,
        })
        .from(payments)
        .leftJoin(
            paymentReconciliations,
            eq(
                paymentReconciliations.paymentId,
                payments.id,
            ),
        )
        .where(
            and(
                eq(
                    payments.provider,
                    "PAYSTACK",
                ),

                or(
                    /*
                     * ====================================================
                     * STARTED PAYMENTS
                     * ====================================================
                     *
                     * Existing reconciliation behavior:
                     * - Checkout must have expired.
                     * - Initialization lease must have expired.
                     * - Missing queue records are discovered.
                     * - DEAD_LETTER records are reconsidered
                     *   after their recovery cooldown.
                     */
                    and(
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

                        or(
                            lte(
                                payments.checkoutExpiresAt,
                                now,
                            ),

                            and(
                                isNull(
                                    payments.checkoutExpiresAt,
                                ),
                                lt(
                                    payments.createdAt,
                                    legacyCutoff,
                                ),
                            ),
                        ),

                        or(
                            isNull(
                                paymentReconciliations.id,
                            ),

                            and(
                                eq(
                                    paymentReconciliations.status,
                                    "DEAD_LETTER",
                                ),
                                lt(
                                    paymentReconciliations.updatedAt,
                                    deadLetterCutoff,
                                ),
                            ),
                        ),
                    ),

                    /*
                     * ====================================================
                     * LATE SUCCESS RECOVERY
                     * ====================================================
                     *
                     * A previously FAILED or ABANDONED payment
                     * can still become SUCCESS if Paystack later
                     * confirms that the transaction succeeded.
                     *
                     * Only reopen records that:
                     * - Belong to Paystack.
                     * - Have a terminal payment status.
                     * - Are within the recovery window.
                     * - Already have a RESOLVED queue record.
                     * - Were last checked at least 24 hours ago.
                     */
                    and(
                        or(
                            eq(
                                payments.status,
                                "FAILED",
                            ),
                            eq(
                                payments.status,
                                "ABANDONED",
                            ),
                        ),

                        gte(
                            payments.createdAt,
                            recoveryWindowCutoff,
                        ),

                        eq(
                            paymentReconciliations.status,
                            "RESOLVED",
                        ),

                        isNotNull(
                            paymentReconciliations.resolvedAt,
                        ),

                        lte(
                            paymentReconciliations.resolvedAt,
                            lateSuccessCutoff,
                        ),
                    ),
                ),
            ),
        )
        .orderBy(
            payments.createdAt,
        )
        .limit(batchSize);

    let enqueued = 0;

    let skipped = 0;

    for (const candidate of candidates) {
        try {
            const result = await enqueuePaymentReconciliation(
                candidate.id,
            );

            if (result.enqueued) {
                enqueued += 1;
            } else {
                skipped += 1;
            }
        } catch {
            /*
             * A single invalid record must not prevent
             * discovery of other eligible payments.
             */
            skipped += 1;
        }
    }

    return {
        examined: candidates.length,
        enqueued,
        skipped,
    };
}