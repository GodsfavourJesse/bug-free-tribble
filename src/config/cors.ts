import type { CorsOptions } from "cors";

import { allowedOrigins } from "./env.ts";

// Normalize configured origins.
const originSet = new Set(
    allowedOrigins.map((origin) =>
        origin.trim().replace(/\/+$/, ""),
    ),
);

/**
 * Requests without an Origin header include:
 * - Server-to-server requests
 * - Webhooks
 * - Health checks
 * - Command-line requests
 */
export function isOriginAllowed(
    origin: string | undefined,
): boolean {
    if (!origin) {
        return true;
    }

    const normalizedOrigin = origin
        .trim()
        .replace(/\/+$/, "");

    return originSet.has(normalizedOrigin);
}

export const corsOptions: CorsOptions = {
    origin(origin, callback) {
        if (isOriginAllowed(origin)) {
            callback(null, true);
            return;
        }

        callback(
            new Error(
                `Origin ${origin} is not allowed by CORS.`,
            ),
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