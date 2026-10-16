import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../../../config/env.ts";

/*
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

const CSRF_TOKEN_PREFIX = "v1";

/*
 * ============================================================
 * TOKEN DERIVATION
 * ============================================================
 */

function deriveCsrfDigest(sessionToken: string): string {
    return createHmac("sha256", env.CSRF_SECRET)
        .update(`karmass:csrf:${sessionToken}`, "utf8")
        .digest("hex");
}

/*
 * ============================================================
 * CREATE TOKEN
 * ============================================================
 */

/**
 * Generate a CSRF token bound to a session token.
 *
 * The raw session token must never be returned
 * as part of the CSRF response.
 */
export function createCsrfToken(sessionToken: string): string {
    if (!sessionToken || sessionToken.trim().length === 0) {
        throw new Error("A valid session token is required.");
    }

    return `${CSRF_TOKEN_PREFIX}.${deriveCsrfDigest(sessionToken)}`;
}

/*
 * ============================================================
 * VERIFY TOKEN
 * ============================================================
 */

/**
 * Validate a supplied CSRF token against the
 * current session token.
 */
export function verifyCsrfToken(
    sessionToken: string,
    suppliedToken: string,
): boolean {
    if (!sessionToken || !suppliedToken) {
        return false;
    }

    const parts = suppliedToken.split(".");

    if (parts.length !== 2 || parts[0] !== CSRF_TOKEN_PREFIX) {
        return false;
    }

    const suppliedDigest = parts[1];

    if (!suppliedDigest || !/^[a-f0-9]{64}$/i.test(suppliedDigest)) {
        return false;
    }

    const expectedDigest = deriveCsrfDigest(sessionToken);

    const suppliedBuffer = Buffer.from(suppliedDigest, "hex");

    const expectedBuffer = Buffer.from(expectedDigest, "hex");

    if (suppliedBuffer.length !== expectedBuffer.length) {
        return false;
    }

    return timingSafeEqual(suppliedBuffer, expectedBuffer);
}