/**
 * Central audit-metadata sanitizer.
 *
 * Audit metadata must be constructed from explicitly selected operational
 * fields, never raw request bodies, credentials, gateway payloads, or models.
 * This sanitizer is a defense-in-depth guard for accidentally included keys.
 */
const SENSITIVE_KEY_PATTERN = /(?:password|passwd|secret|token|authorization|cookie|credential|api[_-]?key|private[_-]?key|access[_-]?key|refresh[_-]?token|session[_-]?(?:token|id)|otp|one[_-]?time[_-]?(?:code|password)|verification[_-]?(?:code|token)|reset[_-]?token|card[_-]?(?:number|no)|cvv|cvc|\bpan\b|\bpin\b|bank[_-]?(?:account|details)|account[_-]?(?:number|no)|routing[_-]?number|provider[_-]?data|raw[_-]?(?:payload|body)|document[_-]?(?:content|url|path|base64)|private[_-]?document|idempotency[_-]?key|email|phone|address|first[_-]?name|last[_-]?name|reason|(?:review|resolution)?[_-]?note|comment|message)/i;

const MAX_DEPTH = 8;
const MAX_ARRAY_ITEMS = 100;
const MAX_STRING_LENGTH = 1_000;
const REDACTED = "[REDACTED]";

function sanitizeValue(
    value: unknown,
    depth: number,
    seen: WeakSet<object>,
): unknown {
    if (value === null || value === undefined) {
        return value ?? null;
    }

    if (typeof value === "string") {
        return value.length > MAX_STRING_LENGTH
            ? `${value.slice(0, MAX_STRING_LENGTH)}[TRUNCATED]`
            : value;
    }

    if (
        typeof value === "number" ||
        typeof value === "boolean"
    ) {
        return Number.isFinite(value as number) || typeof value === "boolean"
            ? value
            : null;
    }

    if (typeof value === "bigint") {
        return value.toString();
    }

    if (value instanceof Date) {
        return Number.isNaN(value.getTime())
            ? null
            : value.toISOString();
    }

    if (typeof value !== "object") {
        return REDACTED;
    }

    if (depth >= MAX_DEPTH || seen.has(value)) {
        return "[OMITTED]";
    }

    seen.add(value);

    if (Array.isArray(value)) {
        const result = value
            .slice(0, MAX_ARRAY_ITEMS)
            .map((item) => sanitizeValue(item, depth + 1, seen));

        if (value.length > MAX_ARRAY_ITEMS) {
            result.push(`[${value.length - MAX_ARRAY_ITEMS} ITEMS OMITTED]`);
        }

        seen.delete(value);
        return result;
    }

    const output: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(value)) {
        if (SENSITIVE_KEY_PATTERN.test(key)) {
            output[key] = REDACTED;
            continue;
        }

        output[key.slice(0, 100)] = sanitizeValue(
            child,
            depth + 1,
            seen,
        );
    }

    seen.delete(value);
    return output;
}

/**
 * Sanitizes metadata before it is persisted to audit_logs.
 * Callers must still avoid passing entire request, session, user, or gateway
 * objects: sanitization is a backstop, not a substitute for data minimization.
 */
export function sanitizeAuditMetadata(value: unknown): unknown {
    if (value === undefined) {
        return undefined;
    }

    if (value === null) {
        return null;
    }

    // Audit metadata should be structured. Do not persist unlabelled strings,
    // which could accidentally be raw credentials, request bodies, or payloads.
    if (typeof value === "string") {
        return { value: REDACTED };
    }

    return sanitizeValue(value, 0, new WeakSet<object>());
}
