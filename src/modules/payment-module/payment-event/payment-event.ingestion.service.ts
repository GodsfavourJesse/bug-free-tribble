import {
    and,
    eq,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    paymentEvents,
    payments,
} from "../../../database/schema/index.ts";

import {
    createPaymentEventIdempotencyKey,
} from "./payment-event.identity.ts";

export interface PersistPaystackEventInput {
    eventType: string;
    reference?: string | undefined;
    transactionId?: string | number | undefined;
    providerEventId?: string | undefined;
    payload: unknown;
}

export interface PersistPaystackEventResult {
    eventId: string;
    duplicate: boolean;
}

/**
 * Persists an authenticated Paystack event before the webhook
 * endpoint acknowledges receipt.
 *
 * Duplicate deliveries return the existing event without resetting
 * its processing status or retry count.
 *
 * IMPORTANT:
 * Call this function only after validating the Paystack signature.
 */
export async function persistPaystackEvent(
    input: PersistPaystackEventInput,
): Promise<PersistPaystackEventResult> {
    const idempotencyKey =
        createPaymentEventIdempotencyKey({
            providerEventId: input.providerEventId,
            eventType: input.eventType,
            reference: input.reference,
            transactionId: input.transactionId,
            payload: input.payload,
        });

    return db.transaction(async (tx) => {
        const matchingPayment = input.reference
            ? await tx
                  .select({
                      id: payments.id,
                  })
                  .from(payments)
                  .where(
                      eq(
                          payments.reference,
                          input.reference,
                      ),
                  )
                  .limit(1)
            : [];

        const paymentId = matchingPayment[0]?.id;

        /*
         * Do not specify a conflict target here.
         *
         * The table has more than one unique constraint:
         * 1. provider + idempotencyKey
         * 2. provider + providerEventId, when providerEventId exists
         *
         * A conflict against either constraint must be handled below.
         */
        const inserted = await tx
            .insert(paymentEvents)
            .values({
                provider: "PAYSTACK",
                providerEventId:
                    input.providerEventId ?? null,
                eventType: input.eventType,
                paymentReference:
                    input.reference ?? null,
                paymentId: paymentId ?? null,
                idempotencyKey,
                signatureStatus: "VALID",
                processingStatus: "RECEIVED",
                attemptCount: 0,
                payload: input.payload,
                receivedAt: new Date(),
                updatedAt: new Date(),
            })
            .onConflictDoNothing()
            .returning({
                id: paymentEvents.id,
            });

        if (inserted[0]) {
            return {
                eventId: inserted[0].id,
                duplicate: false,
            };
        }

        /*
         * First, check the calculated idempotency key.
         */
        const existingByIdempotencyKey = await tx
            .select({
                id: paymentEvents.id,
            })
            .from(paymentEvents)
            .where(
                and(
                    eq(
                        paymentEvents.provider,
                        "PAYSTACK",
                    ),
                    eq(
                        paymentEvents.idempotencyKey,
                        idempotencyKey,
                    ),
                ),
            )
            .limit(1);

        if (existingByIdempotencyKey[0]) {
            return {
                eventId: existingByIdempotencyKey[0].id,
                duplicate: true,
            };
        }

        /*
         * A different calculated key may still refer to an event
         * already recorded under the same provider event ID.
         */
        if (input.providerEventId) {
            const existingByProviderId = await tx
                .select({
                    id: paymentEvents.id,
                })
                .from(paymentEvents)
                .where(
                    and(
                        eq(
                            paymentEvents.provider,
                            "PAYSTACK",
                        ),
                        eq(
                            paymentEvents.providerEventId,
                            input.providerEventId,
                        ),
                    ),
                )
                .limit(1);

            if (existingByProviderId[0]) {
                return {
                    eventId: existingByProviderId[0].id,
                    duplicate: true,
                };
            }
        }

        throw new Error(
            "Unable to persist or locate the Paystack event after a uniqueness conflict.",
        );
    });
}