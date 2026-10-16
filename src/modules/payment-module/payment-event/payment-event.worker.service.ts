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
    paymentEvents,
} from "../../../database/schema/index.ts";

import {
    processPersistedPaystackEvent,
    UnsupportedPaystackEventError,
} from "../payments_helpers/payment-fulfillment.service.ts";

import type {
    PaystackTransactionDataLike,
} from "../payment.types.ts";

/*
 * ============================================================
 * CONFIGURATION
 * ============================================================
 */

const PROVIDER = "PAYSTACK";

const BATCH_SIZE = 10;

const MAX_ATTEMPTS = 8;

const LEASE_DURATION_MS = 60_000;

const BASE_RETRY_DELAY_MS = 2_000;

const MAX_RETRY_DELAY_MS = 15 * 60_000;

/*
 * ============================================================
 * TYPES
 * ============================================================
 */

type StoredPaystackPayload = {
    event: string;
    data: PaystackTransactionDataLike;
};

type ClaimedPaymentEvent = {
    id: string;
    eventType: string;
    payload: unknown;
    attemptCount: number;
};

export type PaymentEventWorkerResult = {
    workerId: string;
    claimed: number;
    processed: number;
    ignored: number;
    retryScheduled: number;
    deadLettered: number;
    lostLease: number;
};

/*
 * ============================================================
 * ERROR SANITIZATION
 * ============================================================
 */

function getSafeErrorMessage(error: unknown): string {
    const message =
        error instanceof Error
            ? error.message
            : "Unknown payment event processing error.";

    /*
     * Avoid persisting arbitrarily large error messages.
     */
    return message.slice(0, 2_000);
}

function getSafeErrorCode(error: unknown): string {
    if (error instanceof UnsupportedPaystackEventError) {
        return "UNSUPPORTED_EVENT";
    }

    const message = getSafeErrorMessage(error).toLowerCase();

    if (message.includes("amount mismatch")) {
        return "AMOUNT_MISMATCH";
    }

    if (message.includes("currency mismatch")) {
        return "CURRENCY_MISMATCH";
    }

    if (message.includes("reference mismatch")) {
        return "REFERENCE_MISMATCH";
    }

    if (message.includes("payment record not found")) {
        return "PAYMENT_NOT_FOUND";
    }

    if (message.includes("not successful")) {
        return "PAYMENT_NOT_CONFIRMED";
    }

    if (message.includes("reversal")) {
        return "REVERSAL_REQUIRES_REVIEW";
    }

    if (message.toLowerCase().includes("paystack")) {
        return "PAYSTACK_PROCESSING_ERROR";
    }

    return "PAYMENT_EVENT_PROCESSING_FAILED";
}

/*
 * ============================================================
 * PAYLOAD VALIDATION
 * ============================================================
 */

function parseStoredPayload(
    event: ClaimedPaymentEvent,
): StoredPaystackPayload {
    const payload: unknown = event.payload;

    if (
        typeof payload !== "object" ||
        payload === null ||
        !("event" in payload) ||
        !("data" in payload)
    ) {
        throw new Error("Stored Paystack payload is invalid.");
    }

    if (
        typeof payload.event !== "string" ||
        payload.event.trim().length === 0
    ) {
        throw new Error("Stored Paystack event type is invalid.");
    }

    if (
        payload.event !== event.eventType
    ) {
        throw new Error(
            "Stored Paystack event type does not match the event record.",
        );
    }

    if (
        typeof payload.data !== "object" ||
        payload.data === null ||
        !("reference" in payload.data) ||
        typeof payload.data.reference !== "string" ||
        payload.data.reference.trim().length === 0
    ) {
        throw new Error(
            "Stored Paystack transaction reference is invalid.",
        );
    }

    return {
        event: payload.event,
        data: payload.data as PaystackTransactionDataLike,
    };
}

/*
 * ============================================================
 * RETRY BACKOFF
 * ============================================================
 */

function calculateRetryDelayMs(attemptCount: number): number {
    const exponent = Math.max(0, attemptCount - 1);

    const exponentialDelay = Math.min(
        MAX_RETRY_DELAY_MS,
        BASE_RETRY_DELAY_MS * 2 ** exponent,
    );

    /*
     * Add up to 20% jitter so multiple failed events do not
     * all retry at exactly the same moment.
     */
    const jitter = Math.random() * exponentialDelay * 0.2;

    return Math.min(
        MAX_RETRY_DELAY_MS,
        Math.floor(exponentialDelay + jitter),
    );
}

/*
 * ============================================================
 * CLAIM EVENTS
 * ============================================================
 *
 * FOR UPDATE SKIP LOCKED allows multiple worker instances to
 * claim different events without processing the same event
 * concurrently.
 *
 * The claim and lease update happen in one database transaction.
 */

async function claimPaymentEvents(
    workerId: string,
): Promise<ClaimedPaymentEvent[]> {
    const now = new Date();

    const leaseExpiry = new Date(
        now.getTime() + LEASE_DURATION_MS,
    );

    return db.transaction(async (tx) => {
        const candidates = await tx
            .select({
                id: paymentEvents.id,
                eventType: paymentEvents.eventType,
                payload: paymentEvents.payload,
                attemptCount: paymentEvents.attemptCount,
            })
            .from(paymentEvents)
            .where(
                and(
                    eq(paymentEvents.provider, PROVIDER),

                    eq(
                        paymentEvents.signatureStatus,
                        "VALID",
                    ),

                    inArray(
                        paymentEvents.processingStatus,
                        [
                            "RECEIVED",
                            "RETRY",
                            "PROCESSING",
                        ],
                    ),
                    or(
                        /*
                         * Newly received events can be processed
                         * immediately.
                         */
                        eq(
                            paymentEvents.processingStatus,
                            "RECEIVED",
                        ),

                        /*
                         * Retry events must be due.
                         */
                        and(
                            eq(
                                paymentEvents.processingStatus,
                                "RETRY",
                            ),
                            or(
                                isNull(paymentEvents.nextAttemptAt),
                                lte(
                                    paymentEvents.nextAttemptAt,
                                    now,
                                ),
                            ),
                        ),

                        /*
                         * Reclaim an event after its worker lease
                         * expires, including rows with no lease.
                         */
                        and(
                            eq(
                                paymentEvents.processingStatus,
                                "PROCESSING",
                            ),
                            or(
                                isNull(paymentEvents.lockedUntil),
                                lte(
                                    paymentEvents.lockedUntil,
                                    now,
                                ),
                            ),
                        ),
                    ),
                ),
            )
            .orderBy(
                sql`${paymentEvents.receivedAt} ASC`,
            )
            .limit(BATCH_SIZE)
            .for("update", {
                skipLocked: true,
            });

        if (candidates.length === 0) {
            return [];
        }

        const ids = candidates.map((event) => event.id);

        const claimedRows = await tx
            .update(paymentEvents)
            .set({
                processingStatus: "PROCESSING",
                attemptCount: sql`${paymentEvents.attemptCount} + 1`,
                lastAttemptAt: now,
                lockedBy: workerId,
                lockedUntil: leaseExpiry,
                nextAttemptAt: null,
                lastErrorCode: null,
                lastErrorMessage: null,
                updatedAt: now,
            })
            .where(
                and(
                    inArray(paymentEvents.id, ids),
                    eq(paymentEvents.provider, PROVIDER),
                ),
            )
            .returning({
                id: paymentEvents.id,
                eventType: paymentEvents.eventType,
                payload: paymentEvents.payload,
                attemptCount: paymentEvents.attemptCount,
            });

        return claimedRows;
    });
}

/*
 * ============================================================
 * MARK PROCESSED
 * ============================================================
 */

async function markEventProcessed(
    eventId: string,
    workerId: string,
): Promise<boolean> {
    const now = new Date();

    const updated = await db
        .update(paymentEvents)
        .set({
            processingStatus: "PROCESSED",
            processedAt: now,
            lockedBy: null,
            lockedUntil: null,
            nextAttemptAt: null,
            lastErrorCode: null,
            lastErrorMessage: null,
            updatedAt: now,
        })
        .where(
            and(
                eq(paymentEvents.id, eventId),
                eq(paymentEvents.processingStatus, "PROCESSING"),
                eq(paymentEvents.lockedBy, workerId),
            ),
        )
        .returning({
            id: paymentEvents.id,
        });

    return updated.length > 0;
}

/*
 * ============================================================
 * MARK IGNORED
 * ============================================================
 */

async function markEventIgnored(
    eventId: string,
    workerId: string,
    message: string,
): Promise<boolean> {
    const updated = await db
        .update(paymentEvents)
        .set({
            processingStatus: "IGNORED",
            lockedBy: null,
            lockedUntil: null,
            nextAttemptAt: null,
            lastErrorCode: "UNSUPPORTED_EVENT",
            lastErrorMessage: message.slice(0, 2_000),
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(paymentEvents.id, eventId),
                eq(paymentEvents.processingStatus, "PROCESSING"),
                eq(paymentEvents.lockedBy, workerId),
            ),
        )
        .returning({
            id: paymentEvents.id,
        });

    return updated.length > 0;
}

/*
 * ============================================================
 * SCHEDULE RETRY OR DEAD LETTER
 * ============================================================
 */

async function scheduleFailure(
    event: ClaimedPaymentEvent,
    workerId: string,
    error: unknown,
): Promise<"RETRY" | "DEAD_LETTER" | "LEASE_LOST"> {
    const now = new Date();

    const deadLettered =
        event.attemptCount >= MAX_ATTEMPTS;

    const retryAt = deadLettered
        ? null
        : new Date(
              now.getTime() +
                  calculateRetryDelayMs(event.attemptCount),
          );

    const message = getSafeErrorMessage(error);

    const updated = await db
        .update(paymentEvents)
        .set({
            processingStatus: deadLettered
                ? "DEAD_LETTER"
                : "RETRY",

            nextAttemptAt: retryAt,

            lockedBy: null,

            lockedUntil: null,

            lastErrorCode: getSafeErrorCode(error),

            lastErrorMessage: message,

            updatedAt: now,
        })
        .where(
            and(
                eq(paymentEvents.id, event.id),
                eq(paymentEvents.processingStatus, "PROCESSING"),
                eq(paymentEvents.lockedBy, workerId),
            ),
        )
        .returning({
            id: paymentEvents.id,
        });

    /*
     * If another worker reclaimed the event, this worker no longer
     * owns it and must not overwrite that worker's state.
     */
    if (updated.length === 0) {
        return "LEASE_LOST";
    }

    return deadLettered ? "DEAD_LETTER" : "RETRY";
}

/*
 * ============================================================
 * PROCESS ONE EVENT
 * ============================================================
 */

async function processClaimedEvent(
    event: ClaimedPaymentEvent,
    workerId: string,
): Promise<"PROCESSED" | "IGNORED" | "RETRY" | "DEAD_LETTER" | "LEASE_LOST"> {
    try {
        const payload = parseStoredPayload(event);

        await processPersistedPaystackEvent(
            payload.event,
            payload.data,
        );

        const updated = await markEventProcessed(
            event.id,
            workerId,
        );

        return updated ? "PROCESSED" : "LEASE_LOST";
    } catch (error: unknown) {
        /*
         * Unsupported event types should not be retried forever.
         */
        if (error instanceof UnsupportedPaystackEventError) {
            const updated = await markEventIgnored(
                event.id,
                workerId,
                getSafeErrorMessage(error),
            );

            return updated ? "IGNORED" : "LEASE_LOST";
        }

        return scheduleFailure(
            event,
            workerId,
            error,
        );
    }
}

/*
 * ============================================================
 * RUN ONE WORKER BATCH
 * ============================================================
 *
 * Call this function periodically from a scheduler.
 *
 * Multiple processes may call it concurrently because event
 * claiming is protected by PostgreSQL row locks and leases.
 */

export async function processPaymentEventBatch(): Promise<PaymentEventWorkerResult> {
    const workerId = randomUUID();

    const result: PaymentEventWorkerResult = {
        workerId,
        claimed: 0,
        processed: 0,
        ignored: 0,
        retryScheduled: 0,
        deadLettered: 0,
        lostLease: 0,
    };

    const events = await claimPaymentEvents(workerId);

    result.claimed = events.length;

    /*
     * Process events sequentially within a batch to avoid
     * overwhelming the payment provider.
     *
     * A future version can use a bounded concurrency pool.
     */
    for (const event of events) {
        const outcome = await processClaimedEvent(
            event,
            workerId,
        );

        switch (outcome) {
            case "PROCESSED":
                result.processed += 1;
                break;

            case "IGNORED":
                result.ignored += 1;
                break;

            case "RETRY":
                result.retryScheduled += 1;
                break;

            case "DEAD_LETTER":
                result.deadLettered += 1;
                break;

            case "LEASE_LOST":
                result.lostLease += 1;
                break;
        }
    }

    return result;
}