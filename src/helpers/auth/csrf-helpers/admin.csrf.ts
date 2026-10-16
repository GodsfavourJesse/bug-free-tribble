import {
    createHmac,
    timingSafeEqual,
} from "node:crypto";

import {
    env,
} from "../../../config/env.ts";

const ADMIN_CSRF_TOKEN_PREFIX = "admin-v1";

function deriveAdminCsrfDigest(
    sessionToken: string,
): string {
    return createHmac(
        "sha256",
        env.CSRF_SECRET,
    )
        .update(
            `karmass:admin:csrf:${sessionToken}`,
            "utf8",
        )
        .digest("hex");
}

export function createAdminCsrfToken(
    sessionToken: string,
): string {
    if (
        !sessionToken ||
        sessionToken.trim().length === 0
    ) {
        throw new Error(
            "A valid administrator session token is required.",
        );
    }

    return [
        ADMIN_CSRF_TOKEN_PREFIX,
        deriveAdminCsrfDigest(sessionToken),
    ].join(".");
}

export function verifyAdminCsrfToken(
    sessionToken: string,
    suppliedToken: string,
): boolean {
    if (
        !sessionToken ||
        !suppliedToken
    ) {
        return false;
    }

    const parts =
        suppliedToken.split(".");

    if (
        parts.length !== 2 ||
        parts[0] !== ADMIN_CSRF_TOKEN_PREFIX
    ) {
        return false;
    }

    const suppliedDigest = parts[1];

    if (
        !suppliedDigest ||
        !/^[a-f0-9]{64}$/i.test(
            suppliedDigest,
        )
    ) {
        return false;
    }

    const expectedDigest =
        deriveAdminCsrfDigest(
            sessionToken,
        );

    const suppliedBuffer =
        Buffer.from(
            suppliedDigest,
            "hex",
        );

    const expectedBuffer =
        Buffer.from(
            expectedDigest,
            "hex",
        );

    if (
        suppliedBuffer.length !==
        expectedBuffer.length
    ) {
        return false;
    }

    return timingSafeEqual(
        suppliedBuffer,
        expectedBuffer,
    );
}