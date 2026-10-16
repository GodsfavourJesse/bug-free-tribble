import { createHash } from "node:crypto";

export interface PaystackEventIdentityInput {
    providerEventId?: string | undefined;
    eventType: string;
    reference?: string | undefined;
    transactionId?: string | number | undefined;
    payload: unknown;
}

function normalizeIdentifier(
    value: string | number | undefined,
): string | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }

    const normalized = String(value).trim();

    return normalized.length > 0
        ? normalized
        : undefined;
}

function canonicalizeValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(canonicalizeValue);
    }

    if (
        value !== null &&
        typeof value === "object"
    ) {
        const record = value as Record<string, unknown>;

        return Object.fromEntries(
            Object.keys(record)
                .sort()
                .map((key) => [
                    key,
                    canonicalizeValue(record[key]),
                ]),
        );
    }

    return value;
}

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

    let identity: unknown;

    if (providerEventId) {
        identity = {
            provider: "PAYSTACK",
            providerEventId,
        };
    } else if (reference && transactionId) {
        identity = {
            provider: "PAYSTACK",
            eventType: input.eventType,
            reference,
            transactionId,
        };
    } else {
        identity = {
            provider: "PAYSTACK",
            eventType: input.eventType,
            reference: reference ?? null,
            transactionId: transactionId ?? null,
            payload: canonicalizeValue(input.payload),
        };
    }

    return createHash("sha256")
        .update(JSON.stringify(identity), "utf8")
        .digest("hex");
}