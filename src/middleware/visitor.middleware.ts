import { randomBytes } from "node:crypto";

import type {
    NextFunction,
    Request,
    Response,
} from "express";

const VISITOR_COOKIE_NAME = "karmass_visitor";

const VISITOR_MAX_AGE_MS =
    1000 * 60 * 60 * 24 * 365;

export function ensureVisitorIdentity(
    request: Request,
    response: Response,
    next: NextFunction,
): void {
    try {
        const existingVisitor =
            request.cookies?.[
                VISITOR_COOKIE_NAME
            ];

        if (
            typeof existingVisitor === "string" &&
            /^[a-f0-9]{64}$/i.test(existingVisitor)
        ) {
            request.visitorId = existingVisitor;

            next();

            return;
        }

        const visitorId =
            randomBytes(32).toString("hex");

        request.visitorId = visitorId;

        response.cookie(
            VISITOR_COOKIE_NAME,
            visitorId,
            {
                httpOnly: true,
                secure:
                    process.env.NODE_ENV ===
                    "production",
                sameSite:
                    process.env.NODE_ENV ===
                    "production"
                        ? "none"
                        : "lax",
                maxAge: VISITOR_MAX_AGE_MS,
                path: "/",
            },
        );

        next();
    } catch (error) {
        next(error);
    }
}