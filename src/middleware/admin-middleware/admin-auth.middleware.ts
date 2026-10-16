import type {
    NextFunction,
    Request,
    Response,
} from "express";

import {
    getAdminFromSession,
} from "../../modules/admin-module/admin-auth/admin-auth.service.ts";

import {
    env,
} from "../../config/env.ts";

const ADMIN_SESSION_COOKIE =
    "karmass_admin_session";

export async function requireAdminAuth(
    request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const token =
            request.cookies?.[
                ADMIN_SESSION_COOKIE
            ];

        if (
            typeof token !== "string" ||
            token.trim().length === 0
        ) {
            response.status(401).json({
                success: false,
                message:
                    "Administrator authentication required.",
            });

            return;
        }

        const admin =
            await getAdminFromSession(token);

        if (!admin) {
            response.clearCookie(
                ADMIN_SESSION_COOKIE,
                {
                    httpOnly: true,
                    secure:
                        env.NODE_ENV === "production",
                    sameSite:
                        env.NODE_ENV === "production"
                            ? "none"
                            : "lax",
                    path: "/",
                },
            );

            response.status(401).json({
                success: false,
                message:
                    "Administrator session is invalid or expired.",
            });

            return;
        }

        // Keep administrator identity separate from customer identity.
        request.admin = admin;

        next();
    } catch (error) {
        next(error);
    }
}