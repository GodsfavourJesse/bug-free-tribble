import type { NextFunction, Request, Response } from "express";

import { env } from "../config/env.ts";

import { verifyCsrfToken } from "../helpers/auth/csrf-helpers/auth.csrf.ts";

/*
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/*
 * ============================================================
 * CSRF MIDDLEWARE
 * ============================================================
 */

export function requireCsrfToken(
    request: Request,
    response: Response,
    next: NextFunction,
): void {
    if (SAFE_METHODS.has(request.method)) {
        next();
        return;
    }

    const sessionToken = request.cookies?.[env.SESSION_COOKIE_NAME];

    const suppliedToken = request.get("X-CSRF-Token");

    if (
        !sessionToken ||
        !suppliedToken ||
        !verifyCsrfToken(sessionToken, suppliedToken)
    ) {
        response.status(403).json({
            success: false,
            error: {
                code: "CSRF_VALIDATION_FAILED",
                message:
                    "Your request could not be verified. Refresh the page and try again.",
            },
        });

        return;
    }

    next();
}