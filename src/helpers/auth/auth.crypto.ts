import {
    createHash,
    createHmac,
    randomBytes,
    randomInt,
} from "node:crypto";

import { env } from "../../config/env.ts";

export function normalizeEmail(
    email: string,
): string {
    return email
        .trim()
        .toLowerCase();
}

export function hashSessionToken(
    token: string,
): string {
    return createHmac(
        "sha256",
        env.SESSION_SECRET,
    )
        .update(token)
        .digest("hex");
}

export function hashVerificationValue(
    value: string,
): string {
    return createHash("sha256")
        .update(value)
        .digest("hex");
}

export function hashLoginThrottleKey(
    email: string,
    ipAddress: string,
): string {
    return createHash("sha256")
        .update(
            `${normalizeEmail(email)}:${ipAddress}`,
        )
        .digest("hex");
}

export function createSessionToken(): string {
    return randomBytes(48)
        .toString("hex");
}

export function createVerificationCode(): string {
    return randomInt(
        100000,
        1000000,
    ).toString();
}

export function createVerificationToken(): string {
    return randomBytes(48)
        .toString("base64url");
}

export function createPasswordResetToken(): string {
    return randomBytes(48)
        .toString("base64url");
}