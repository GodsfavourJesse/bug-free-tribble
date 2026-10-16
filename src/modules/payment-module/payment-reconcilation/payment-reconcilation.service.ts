import {
    and,
    asc,
    eq,
    inArray,
    lt,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    payments,
} from "../../../database/schema/index.ts";

import {
    verifyAndFulfillPayment,
} from "../payment.service.ts";

const RECONCILABLE_STATUSES = [
    "PENDING",
    "PROCESSING",
] as const;

const DEFAULT_BATCH_SIZE = 20;
const MAX_BATCH_SIZE = 100;

const DEFAULT_MINIMUM_AGE_MINUTES = 10;
const MAX_MINIMUM_AGE_MINUTES = 24 * 60;

export interface PaymentReconciliationOptions {
    batchSize?: number;
    minimumAgeMinutes?: number;
}

export interface PaymentReconciliationResult {
    examined: number;
    succeeded: number;
    stillPending: number;
    failed: number;
    errors: number;
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
        Math.max(
            Math.floor(value),
            1,
        ),
        maximum,
    );
}

export async function reconcilePendingPayments(
    options: PaymentReconciliationOptions = {},
): Promise<PaymentReconciliationResult> {
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

    const cutoff = new Date(
        Date.now() -
        minimumAgeMinutes * 60 * 1000,
    );

    const candidates = await db
        .select({
            id: payments.id,
            userId: payments.userId,
            reference: payments.reference,
            status: payments.status,
        })
        .from(payments)
        .where(
            and(
                inArray(
                    payments.status,
                    [...RECONCILABLE_STATUSES],
                ),
                eq(
                    payments.provider,
                    "PAYSTACK",
                ),
                lt(
                    payments.createdAt,
                    cutoff,
                ),
            ),
        )
        .orderBy(
            asc(
                payments.createdAt,
            ),
        )
        .limit(
            batchSize,
        );

    const result: PaymentReconciliationResult = {
        examined: candidates.length,
        succeeded: 0,
        stillPending: 0,
        failed: 0,
        errors: 0,
    };

    for (const candidate of candidates) {
        try {
            await verifyAndFulfillPayment(
                candidate.userId,
                candidate.reference,
            );
        } catch {
            /*
             * Verification can throw when Paystack confirms that
             * a transaction is unsuccessful, or when verification
             * fails because of a temporary network or provider error.
             *
             * Do not assume the payment's status from the exception.
             * Read the current database status below.
             */
        }

        try {
            const [currentPayment] = await db
                .select({
                    status: payments.status,
                })
                .from(payments)
                .where(
                    eq(
                        payments.id,
                        candidate.id,
                    ),
                )
                .limit(1);

            if (!currentPayment) {
                result.errors += 1;
                continue;
            }

            if (
                currentPayment.status === "SUCCESS"
            ) {
                result.succeeded += 1;
                continue;
            }

            if (
                currentPayment.status === "FAILED" ||
                currentPayment.status === "ABANDONED" ||
                currentPayment.status === "REVERSED"
            ) {
                result.failed += 1;
                continue;
            }

            result.stillPending += 1;
        } catch {
            result.errors += 1;
        }
    }

    return result;
}