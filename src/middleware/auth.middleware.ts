import type {
    NextFunction,
    Request,
    Response,
} from "express";

import { env } from "../config/env.ts";
import { sessionCookieOptions } from "../config/cookies.ts";

import {
    getUserFromSession,
} from "../modules/auth/auth.service.ts";

export async function requireAuth(
    request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const token =
            request.cookies?.[
                env.SESSION_COOKIE_NAME
            ];

        if (!token) {
            response
                .status(401)
                .json({
                    success: false,
                    message:
                        "Authentication required.",
                });

            return;
        }

        const user =
            await getUserFromSession(
                token,
            );

        if (!user) {
            response
                .status(401)
                .json({
                    success: false,
                    message:
                        "Invalid or expired session.",
                });

            return;
        }

        request.user = user;

        // Keep active sessions alive. The database expiry is renewed by
        // getUserFromSession; refresh the browser cookie to match it.
        response.cookie(
            env.SESSION_COOKIE_NAME,
            token,
            sessionCookieOptions(),
        );

        next();
    } catch (error) {
        next(error);
    }
}
