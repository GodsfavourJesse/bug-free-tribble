import {
    and,
    eq,
    inArray,
    isNull,
    lt,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    paymentReconciliations,
    payments,
} from "../../../database/schema/index.ts";

const RECONCILABLE_PAYMENT_STATUSES = [
    "PENDING",
    "PROCESSING",
] as const;

const DEFAULT_RECONCILIATION_DELAY_MINUTES = 10;
const MAX_BATCH_SIZE = 500;

export interface EnqueueReconciliationResult {
    paymentId: string;
    enqueued: boolean;
    reason: "ENQUEUED" | "ALREADY_QUEUED" | "PAYMENT_NOT_ELIGIBLE";
}

export interface DiscoverReconciliationOptions {
    batchSize?: number;
    minimumAgeMinutes?: number;
}

export interface DiscoverReconciliationResult {
    examined: number;
    enqueued: number;
    skipped: number;
}

/**
 * Adds one eligible Paystack payment to the durable reconciliation queue.
 *
 * The unique paymentId constraint prevents duplicate queue records.
 * Existing reconciliation records are deliberately not reset, because
 * doing so could revive resolved or dead-lettered work unintentionally.
 */
export async function enqueuePaymentReconciliation(
    paymentId: string,
): Promise<EnqueueReconciliationResult> {
    const [payment] = await db
        .select({
            id: payments.id,
            provider: payments.provider,
            status: payments.status,
        })
        .from(payments)
        .where(eq(payments.id, paymentId))
        .limit(1);

    if (
        !payment ||
        payment.provider !== "PAYSTACK" ||
        !RECONCILABLE_PAYMENT_STATUSES.includes(
            payment.status as (typeof RECONCILABLE_PAYMENT_STATUSES)[number],
        )
    ) {
        return {
            paymentId,
            enqueued: false,
            reason: "PAYMENT_NOT_ELIGIBLE",
        };
    }

    const now = new Date();

    const nextAttemptAt = new Date(
        now.getTime() +
            DEFAULT_RECONCILIATION_DELAY_MINUTES * 60 * 1000,
    );

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
        return {
            paymentId,
            enqueued: true,
            reason: "ENQUEUED",
        };
    }

    return {
        paymentId,
        enqueued: false,
        reason: "ALREADY_QUEUED",
    };
}

/**
 * Discovers old pending Paystack payments that do not yet have a
 * reconciliation record.
 *
 * This is the safety net for cases where payment creation succeeded
 * but queue insertion did not happen, such as a process crash.
 *
 * Run this periodically from the reconciliation scheduler.
 */
export async function discoverPaymentsForReconciliation(
    options: DiscoverReconciliationOptions = {},
): Promise<DiscoverReconciliationResult> {
    const batchSize = normalizeInteger(
        options.batchSize,
        100,
        MAX_BATCH_SIZE,
    );

    const minimumAgeMinutes = normalizeInteger(
        options.minimumAgeMinutes,
        DEFAULT_RECONCILIATION_DELAY_MINUTES,
        24 * 60,
    );

    const cutoff = new Date(
        Date.now() - minimumAgeMinutes * 60 * 1000,
    );

    const candidates = await db
        .select({
            id: payments.id,
        })
        .from(payments)
        .leftJoin(
            paymentReconciliations,
            eq(paymentReconciliations.paymentId, payments.id),
        )
        .where(
            and(
                eq(payments.provider, "PAYSTACK"),
                inArray(
                    payments.status,
                    [...RECONCILABLE_PAYMENT_STATUSES],
                ),
                lt(payments.createdAt, cutoff),
                isNull(paymentReconciliations.id),
            ),
        )
        .orderBy(payments.createdAt)
        .limit(batchSize);

    let enqueued = 0;
    let skipped = 0;

    for (const candidate of candidates) {
        try {
            const result = await enqueuePaymentReconciliation(
                candidate.id,
            );

            if (result.enqueued) {
                enqueued++;
            } else {
                skipped++;
            }
        } catch {
            // One bad candidate must not prevent processing the others.
            skipped++;
        }
    }

    return {
        examined: candidates.length,
        enqueued,
        skipped,
    };
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
        Math.max(1, Math.floor(value)),
    );
}