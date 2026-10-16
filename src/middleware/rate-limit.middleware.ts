import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request, Response } from "express";

import { env } from "../config/env.ts";

/*
 * ============================================================
 * RESPONSE HELPERS
 * ============================================================
 */

/**
 * Standard response for rate-limit violations.
 *
 * Keep the response structure consistent with the
 * rest of the KARMASS API.
 */
interface RateLimitErrorResponse {
    success: false;
    error: {
        code: string;
        message: string;
    };
}

function createRateLimitResponse(
    code: string,
    message: string,
): RateLimitErrorResponse {
    return {
        success: false,
        error: {
            code,
            message,
        },
    };
}

function createRateLimitHandler(code: string, message: string) {
    return (_request: Request, response: Response): void => {
        response.status(429).json(createRateLimitResponse(code, message));
    };
}

/*
 * ============================================================
 * KEY GENERATION
 * ============================================================
 */

/**
 * Normalize an IP address for rate-limit keys.
 *
 * Do not trust arbitrary forwarding headers here.
 * Express derives request.ip according to the
 * application's configured trust-proxy setting.
 */
function getIpRateLimitKey(request: Request): string {
    return ipKeyGenerator(request.ip || "unknown");
}

/*
 * ============================================================
 * LIMITERS
 * ============================================================
 */

/**
 * Global API limiter.
 *
 * Applies to requests that reach this middleware.
 * Health checks and payment webhooks may need
 * separate policies depending on their routes
 * and deployment requirements.
 */
export const globalRateLimiter = rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,

    limit: env.RATE_LIMIT_MAX_REQUESTS,

    standardHeaders: "draft-8",

    legacyHeaders: false,

    passOnStoreError: false,

    handler: createRateLimitHandler(
        "RATE_LIMIT_EXCEEDED",
        "Too many requests. Please try again later.",
    ),
});

/**
 * Authentication limiter.
 *
 * Mount on sensitive authentication endpoints,
 * including login, registration, password reset,
 * and verification routes as appropriate.
 *
 * This is an IP-based limit. Keep the database-backed
 * login throttling in auth.security.ts as a separate
 * protection against repeated attempts against one
 * account from multiple IP addresses.
 */
export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,

    limit: 20,

    standardHeaders: "draft-8",

    legacyHeaders: false,

    passOnStoreError: false,

    keyGenerator: getIpRateLimitKey,

    handler: createRateLimitHandler(
        "AUTH_RATE_LIMIT_EXCEEDED",
        "Too many authentication attempts. Please try again later.",
    ),
});



/**
 * Administrator login limiter.
 *
 * Restricts repeated login attempts from one IP address.
 * Keep this separate from the general authentication
 * limiter so administrator access has its own policy.
 */
export const adminLoginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,

    limit: 10,

    standardHeaders: "draft-8",

    legacyHeaders: false,

    passOnStoreError: false,

    keyGenerator: getIpRateLimitKey,

    handler: createRateLimitHandler(
        "ADMIN_LOGIN_RATE_LIMIT_EXCEEDED",
        "Too many administrator login attempts. Please try again later.",
    ),
});

/**
 * Administrator challenge-start limiter.
 *
 * Limits challenge creation to reduce resource abuse.
 */
export const adminChallengeStartRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,

    limit: 10,

    standardHeaders: "draft-8",

    legacyHeaders: false,

    passOnStoreError: false,

    keyGenerator: getIpRateLimitKey,

    handler: createRateLimitHandler(
        "ADMIN_CHALLENGE_START_RATE_LIMIT_EXCEEDED",
        "Too many security challenges requested. Please try again later.",
    ),
});

/**
 * Administrator challenge-interaction limiter.
 *
 * Applies to retrieving the current challenge and
 * submitting answers.
 */
export const adminChallengeInteractionRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,

    limit: 30,

    standardHeaders: "draft-8",

    legacyHeaders: false,

    passOnStoreError: false,

    keyGenerator: getIpRateLimitKey,

    handler: createRateLimitHandler(
        "ADMIN_CHALLENGE_RATE_LIMIT_EXCEEDED",
        "Too many security challenge requests. Please try again later.",
    ),
});



/**
 * Upload limiter.
 *
 * Authenticated requests are limited by user ID.
 * Requests without an authenticated user are limited
 * by IP address.
 *
 * Mount this after authentication middleware on
 * authenticated upload routes so request.user is
 * populated before the limiter runs.
 */
export const uploadRateLimiter = rateLimit({
    windowMs: env.UPLOAD_RATE_LIMIT_WINDOW_MS,

    limit: env.UPLOAD_RATE_LIMIT_MAX_REQUESTS,

    standardHeaders: "draft-8",

    legacyHeaders: false,

    passOnStoreError: false,

    keyGenerator: (request: Request): string => {
        const userId = request.user?.id;

        if (userId) {
            return `user:${userId}`;
        }

        return getIpRateLimitKey(request);
    },

    handler: createRateLimitHandler(
        "UPLOAD_RATE_LIMIT_EXCEEDED",
        "Too many upload requests. Please try again later.",
    ),
});