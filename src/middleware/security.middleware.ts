import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";

import { env } from "../config/env.ts";

/**
 * Security headers for a JSON API.
 *
 * The API never serves HTML, so the CSP denies everything and
 * framing/embedding is disabled. HSTS is only sent in production
 * (the client must be reached over HTTPS there).
 */
export const securityHeaders = helmet({
    contentSecurityPolicy: {
        useDefaults: false,
        directives: {
            defaultSrc: ["'none'"],
            baseUri: ["'none'"],
            formAction: ["'none'"],
            frameAncestors: ["'none'"],
        },
    },

    referrerPolicy: { policy: "no-referrer" },

    frameguard: { action: "deny" },

    strictTransportSecurity:
        env.NODE_ENV === "production"
            ? { maxAge: 63_072_000, includeSubDomains: true }
            : false,

    crossOriginResourcePolicy: { policy: "same-site" },
});

/**
 * API responses can contain personal data and session state;
 * never let browsers or intermediaries cache them.
 */
export function noStore(
    _request: Request,
    response: Response,
    next: NextFunction,
): void {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Pragma", "no-cache");

    next();
}
