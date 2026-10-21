import type { CorsOptions } from "cors";

import { allowedOrigins } from "./env.ts";

const originSet = new Set(allowedOrigins);

/**
 * Requests without an Origin header include server-to-server calls,
 * webhooks, health checks, and command-line requests.
 */
export function isOriginAllowed(
    origin: string | undefined,
): boolean {
    if (!origin) {
        return true;
    }

    return originSet.has(origin);
}

export const corsOptions: CorsOptions = {
    origin(origin, callback) {
        callback(
            null,
            isOriginAllowed(origin),
        );
    },

    credentials: true,

    methods: [
        "GET",
        "HEAD",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
    ],

    allowedHeaders: [
        "Accept",
        "Content-Type",
        "Authorization",
        "X-Request-Id",
        "X-CSRF-Token",
        "Idempotency-Key",
    ],

    exposedHeaders: [
        "X-Request-Id",
        "Retry-After",
        "RateLimit",
        "RateLimit-Policy",
    ],

    maxAge: 600,

    optionsSuccessStatus: 204,
};