import type { CookieOptions } from "express";

import { env } from "./env.ts";

/**
 * Single source of truth for session cookie attributes.
 *
 * Driven by SESSION_COOKIE_SECURE / SESSION_COOKIE_SAME_SITE so
 * production behaviour is configured (and validated at boot)
 * rather than inferred from NODE_ENV.
 */
function baseOptions(): CookieOptions {
    return {
        httpOnly: true,
        secure: env.SESSION_COOKIE_SECURE,
        sameSite: env.SESSION_COOKIE_SAME_SITE,
        path: "/",
    };
}

export function sessionCookieOptions(): CookieOptions {
    return {
        ...baseOptions(),
        maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    };
}

/**
 * clearCookie only works when the attributes match the ones
 * used to set the cookie (minus maxAge/expires).
 */
export function clearSessionCookieOptions(): CookieOptions {
    return baseOptions();
}
