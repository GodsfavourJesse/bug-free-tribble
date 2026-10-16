import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { payments } from "./payments.ts";

/**
 * Payment provider event processing lifecycle.
 *
 * RECEIVED:
 * The event has been durably recorded but not processed yet.
 *
 * PROCESSING:
 * A worker has claimed the event.
 *
 * PROCESSED:
 * The event was handled successfully.
 *
 * RETRY:
 * Processing failed, but another attempt is permitted.
 *
 * DEAD_LETTER:
 * Automatic retries have been exhausted or the event requires
 * manual intervention.
 *
 * IGNORED:
 * The event was validly received but is not relevant to our
 * payment fulfillment workflow.
 */
export const paymentEventProcessingStatusEnum = pgEnum(
  "payment_event_processing_status",
  [
    "RECEIVED",
    "PROCESSING",
    "PROCESSED",
    "RETRY",
    "DEAD_LETTER",
    "IGNORED",
  ],
);

/**
 * Signature verification outcome.
 *
 * UNKNOWN is used before verification has completed.
 * INVALID events must never trigger payment fulfillment.
 */
export const paymentEventSignatureStatusEnum = pgEnum(
  "payment_event_signature_status",
  ["UNKNOWN", "VALID", "INVALID"],
);

/**
 * Durable record of webhook deliveries and payment processing.
 *
 * This table is intentionally separate from `payments`.
 *
 * A payment represents a financial transaction in KARMASS.
 * A payment event represents a notification or processing attempt
 * concerning that transaction.
 */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    /**
     * Payment provider that delivered the event.
     *
     * Keeping this field makes the table extensible to other
     * payment providers in the future.
     */
    provider: varchar("provider", {
      length: 50,
    })
      .notNull()
      .default("PAYSTACK"),

    /**
     * Provider event identifier, when one is available and
     * documented as stable.
     *
     * This is nullable because not every webhook payload
     * necessarily includes a suitable event ID.
     */
    providerEventId: varchar("provider_event_id", {
      length: 200,
    }),

    /**
     * Event type, for example:
     * charge.success
     * charge.failed
     * transfer.reversed
     */
    eventType: varchar("event_type", {
      length: 150,
    }).notNull(),

    /**
     * Payment reference extracted from the event, if available.
     *
     * This is deliberately not a foreign key because malformed,
     * delayed, or unrelated provider events may reference a
     * payment that does not exist in KARMASS.
     */
    paymentReference: varchar("payment_reference", {
      length: 100,
    }),

    /**
     * Optional association with our internal payment record.
     *
     * ON DELETE SET NULL preserves the webhook audit record if
     * a payment record is ever removed.
     */
    paymentId: uuid("payment_id").references(() => payments.id, {
      onDelete: "set null",
    }),

    /**
     * Deterministic idempotency key for the provider event.
     *
     * When a stable provider event ID exists, derive the key
     * from provider + provider event ID.
     *
     * Otherwise, derive it from a documented canonical
     * representation of the event's identifying fields.
     *
     * Store a fixed-length SHA-256 hex digest here rather than
     * storing an arbitrarily large event body as the key.
     */
    idempotencyKey: varchar("idempotency_key", {
      length: 64,
    }).notNull(),

    /**
     * Signature validation result.
     *
     * Never mark a webhook as VALID without actually verifying
     * its signature against the original raw request body.
     */
    signatureStatus: paymentEventSignatureStatusEnum("signature_status")
      .notNull()
      .default("UNKNOWN"),

    /**
     * Current processing lifecycle state.
     */
    processingStatus: paymentEventProcessingStatusEnum("processing_status")
      .notNull()
      .default("RECEIVED"),

    /**
     * Number of processing attempts.
     *
     * The webhook delivery count and processing-attempt count
     * are different concepts. This counter tracks attempts to
     * process the persisted event.
     */
    attemptCount: integer("attempt_count").notNull().default(0),

    /**
     * Original provider payload.
     *
     * Keep the payload for investigation and recovery, but
     * never store API secrets or authorization credentials here.
     */
    payload: jsonb("payload").notNull(),

    /**
     * Short, safe error code for filtering and monitoring.
     *
     * Examples:
     * INVALID_SIGNATURE
     * PAYMENT_NOT_FOUND
     * AMOUNT_MISMATCH
     * PROVIDER_VERIFICATION_FAILED
     */
    lastErrorCode: varchar("last_error_code", {
      length: 100,
    }),

    /**
     * Sanitized error details.
     *
     * Do not put API keys, tokens, full authorization headers,
     * or unnecessary personal information in this field.
     */
    lastErrorMessage: text("last_error_message"),

    /**
     * When the provider event first reached our webhook endpoint.
     */
    receivedAt: timestamp("received_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),

    /**
     * When processing was last attempted.
     */
    lastAttemptAt: timestamp("last_attempt_at", {
      withTimezone: true,
    }),

    /**
     * When the event was successfully processed.
     *
     * Remains NULL for failed or unprocessed events.
     */
    processedAt: timestamp("processed_at", {
      withTimezone: true,
    }),

    /**
     * Retry scheduling.
     *
     * Workers should not retry before this timestamp.
     */
    nextAttemptAt: timestamp("next_attempt_at", {
      withTimezone: true,
    }),

    /**
     * Worker lease expiration.
     *
     * If a worker crashes while processing an event, another
     * worker can reclaim it after the lease expires.
     */
    lockedUntil: timestamp("locked_until", {
      withTimezone: true,
    }),

    /**
     * Optional worker identifier useful for diagnosing stuck jobs.
     */
    lockedBy: varchar("locked_by", {
      length: 150,
    }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    /**
     * Critical duplicate-delivery protection.
     *
     * The provider is included so different providers can use
     * their own event identifier namespaces.
     */
    providerIdempotencyUniqueIdx: uniqueIndex(
      "payment_events_provider_idempotency_unique_idx",
    ).on(table.provider, table.idempotencyKey),

    /**
     * A provider event ID can be absent, so uniqueness applies
     * only when it is present.
     */
    providerEventUniqueIdx: uniqueIndex(
      "payment_events_provider_event_unique_idx",
    )
      .on(table.provider, table.providerEventId)
      .where(sql`${table.providerEventId} IS NOT NULL`),

    paymentReferenceIdx: index(
      "payment_events_payment_reference_idx",
    ).on(table.paymentReference),

    paymentIdIdx: index("payment_events_payment_id_idx").on(
      table.paymentId,
    ),

    statusReceivedIdx: index(
      "payment_events_status_received_idx",
    ).on(table.processingStatus, table.receivedAt),

    retryScheduleIdx: index(
      "payment_events_retry_schedule_idx",
    ).on(table.processingStatus, table.nextAttemptAt),

    lockedUntilIdx: index("payment_events_locked_until_idx").on(
      table.lockedUntil,
    ),

    attemptCountNonNegativeCheck: check(
      "payment_events_attempt_count_non_negative",
      sql`${table.attemptCount} >= 0`,
    ),

    idempotencyKeyLengthCheck: check(
      "payment_events_idempotency_key_length_check",
      sql`length(${table.idempotencyKey}) = 64`,
    ),
  }),
);

export type PaymentEvent = typeof paymentEvents.$inferSelect;
export type NewPaymentEvent = typeof paymentEvents.$inferInsert;