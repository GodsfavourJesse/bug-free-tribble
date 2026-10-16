import { createHash } from "node:crypto";

export interface PaystackEventIdentityInput {
    provider: "PAYSTACK";
    eventType: string;
    reference?: string;
    transactionId?: string | number;
    providerEventId?: string;
    payload: unknown;
}

/**
 * Converts a value into a normalized, non-empty string.
 */
function normalizeIdentifier(
    value: string | number | undefined,
): string | undefined {
    if (
        typeof value !== "string" &&
        typeof value !== "number"
    ) {
        return undefined;
    }

    const normalized = String(value).trim();

    return normalized.length > 0
        ? normalized
        : undefined;
}

/**
 * Generates a deterministic SHA-256 idempotency key for a
 * Paystack event.
 *
 * Prefer a stable provider event ID when one exists.
 *
 * Otherwise, use the event type and stable transaction
 * identifiers. If these identifiers are unavailable, include
 * a deterministic representation of the payload.
 *
 * This function does not verify the webhook signature.
 */
export function createPaymentEventIdempotencyKey(
    input: PaystackEventIdentityInput,
): string {
    const providerEventId = normalizeIdentifier(
        input.providerEventId,
    );

    const reference = normalizeIdentifier(
        input.reference,
    );

    const transactionId = normalizeIdentifier(
        input.transactionId,
    );

    let identity: string;

    if (providerEventId) {
        identity = JSON.stringify({
            provider: input.provider,
            providerEventId,
        });
    } else if (reference && transactionId) {
        identity = JSON.stringify({
            provider: input.provider,
            eventType: input.eventType,
            reference,
            transactionId,
        });
    } else {
        identity = JSON.stringify({
            provider: input.provider,
            eventType: input.eventType,
            reference: reference ?? null,
            transactionId: transactionId ?? null,
            payload: canonicalizeValue(input.payload),
        });
    }

    return createHash("sha256")
        .update(identity, "utf8")
        .digest("hex");
}

/**
 * Recursively sorts object keys to provide a deterministic
 * representation of JSON-compatible values.
 */
function canonicalizeValue(
    value: unknown,
): unknown {
    if (Array.isArray(value)) {
        return value.map(canonicalizeValue);
    }

    if (
        value !== null &&
        typeof value === "object"
    ) {
        const record = value as Record<
            string,
            unknown
        >;

        const sortedRecord: Record<
            string,
            unknown
        > = {};

        for (
            const key of Object.keys(record).sort()
        ) {
            sortedRecord[key] = canonicalizeValue(
                record[key],
            );
        }

        return sortedRecord;
    }

    return value;
}