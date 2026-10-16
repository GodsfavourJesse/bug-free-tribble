import type { CorsOptions } from "cors";

import { allowedOrigins } from "./env.ts";

const originSet = new Set(allowedOrigins);

/**
 * Requests without an Origin header (server-to-server calls,
 * Paystack webhooks, health checks, curl) are allowed through;
 * CORS is a browser-only mechanism.
 *
 * Browser requests from unknown origins simply receive no CORS
 * headers, so the browser blocks them.
 */
export function isOriginAllowed(origin: string | undefined): boolean {
    if (!origin) {
        return true;
    }

    return originSet.has(origin);
}

export const corsOptions: CorsOptions = {
    origin(origin, callback) {
        callback(null, isOriginAllowed(origin));
    },

    credentials: true,

    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

    allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],

    exposedHeaders: [
        "X-Request-Id",
        "Retry-After",
        "RateLimit",
        "RateLimit-Policy",
    ],

    maxAge: 600,

    optionsSuccessStatus: 204,
};
