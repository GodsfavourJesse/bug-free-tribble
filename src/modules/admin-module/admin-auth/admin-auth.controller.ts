import type {
    NextFunction,
    Request,
    Response,
} from "express";

import {
    AdminAuthError,
    loginAdmin,
    logoutAdmin,
} from "./admin-auth.service.ts";

import {
    env,
} from "../../../config/env.ts";
import { createAdminCsrfToken } from "../../../helpers/auth/csrf-helpers/admin.csrf.ts";

const ADMIN_SESSION_COOKIE =
    "karmass_admin_session";

function getAdminToken(
    request: Request,
): string | undefined {
    const token =
        request.cookies?.[
            ADMIN_SESSION_COOKIE
        ];

    return typeof token === "string"
        ? token
        : undefined;
}

function getMetadata(
    request: Request,
): {
    userAgent?: string;
    ipAddress?: string;
} {
    const metadata: {
        userAgent?: string;
        ipAddress?: string;
    } = {};

    const userAgent =
        request.get("user-agent");

    if (userAgent) {
        metadata.userAgent =
            userAgent.slice(0, 500);
    }

    if (request.ip) {
        metadata.ipAddress =
            request.ip.slice(0, 64);
    }

    return metadata;
}

function setAdminCookie(
    response: Response,
    token: string,
): void {
    response.cookie(
        ADMIN_SESSION_COOKIE,
        token,
        {
            httpOnly: true,
            secure:
                env.NODE_ENV === "production",
            sameSite:
                env.NODE_ENV === "production"
                    ? "none"
                    : "lax",
            maxAge:
                env.SESSION_TTL_DAYS *
                24 *
                60 *
                60 *
                1000,
            path: "/",
        },
    );
}

function clearAdminCookie(
    response: Response,
): void {
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
}

function handleAdminAuthError(
    error: unknown,
    response: Response,
    next: NextFunction,
): void {
    if (error instanceof AdminAuthError) {
        response.status(
            error.statusCode,
        ).json({
            success: false,
            error: {
                code: error.code,
                message: error.message,
            }
        });

        return;
    }

    next(error);
}

export async function loginAdminController(
    request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const body = request.body as {
            email: string;
            password: string;
            challengeToken: string;
        };

        const result = await loginAdmin(
            {
                email: body.email,
                password: body.password,
                challengeToken: body.challengeToken,
            },
            getMetadata(request),
        );

        setAdminCookie(response, result.token);

        response
            .setHeader("Cache-Control", "no-store")
            .status(200)
            .json({
                success: true,
                message: "Administrator login successful.",
                data: {
                    admin: result.admin,
                },
            });
    } catch (error) {
        handleAdminAuthError(error, response, next);
    }
}

export async function getAdminMeController(
    request: Request,
    response: Response,
): Promise<void> {
    const admin = request.admin;

    if (!admin) {
        clearAdminCookie(response);

        response.status(401).json({
            success: false,
            message:
                "Administrator authentication required.",
        });

        return;
    }

    response.status(200).json({
        success: true,
        data: {
            admin,
        },
    });
}

export async function logoutAdminController(
    request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const token =
            getAdminToken(request);

        if (token) {
            await logoutAdmin(token, getMetadata(request));
        }

        clearAdminCookie(response);

        response.status(200).json({
            success: true,
            message:
                "Administrator logged out successfully.",
        });
    } catch (error) {
        handleAdminAuthError(
            error,
            response,
            next,
        );
    }
}

export async function getAdminCsrfTokenController(
    request: Request,
    response: Response,
): Promise<void> {
    const token = getAdminToken(request);

    if (!token) {
        clearAdminCookie(response);

        response.status(401).json({
            success: false,
            error: {
                code: "ADMIN_AUTHENTICATION_REQUIRED",
                message:
                    "Administrator authentication required.",
            },
        });

        return;
    }

    try {
        const { getAdminFromSession } =
            await import("./admin-auth.service.ts");

        const admin =
            await getAdminFromSession(token);

        if (!admin) {
            clearAdminCookie(response);

            response.status(401).json({
                success: false,
                error: {
                    code: "INVALID_ADMIN_SESSION",
                    message:
                        "Administrator session is invalid or expired.",
                },
            });

            return;
        }

        response
            .setHeader("Cache-Control", "no-store")
            .setHeader("Pragma", "no-cache")
            .status(200)
            .json({
                success: true,
                data: {
                    csrfToken:
                        createAdminCsrfToken(token),
                },
            });
    } catch (error) {
        response.status(500).json({
            success: false,
            error: {
                code: "ADMIN_CSRF_TOKEN_ERROR",
                message:
                    "Unable to issue an administrator security token.",
            },
        });
    }
}