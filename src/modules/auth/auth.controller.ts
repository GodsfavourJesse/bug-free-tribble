import type {
    Request,
    Response,
} from "express";

import { env } from "../../config/env.ts";

import {
    forgotPasswordSchema,
    changePasswordSchema,
    loginSchema,
    registerSchema,
    resendVerificationSchema,
    resetPasswordSchema,
    sessionIdSchema,
    verifyEmailCodeSchema,
    verifyEmailTokenSchema,
} from "./auth.validation.ts";

import {
    changeUserPassword,
    forgotPassword,
    getSessions,
    getUserFromSession,
    loginUser,
    logoutUser,
    registerUser,
    resendVerificationEmail,
    resetUserPassword,
    revokeAllSessions,
    revokeSession,
    verifyEmailByCode,
    verifyEmailByToken,
} from "./auth.service.ts";
import { createCsrfToken } from "../../helpers/auth/csrf-helpers/auth.csrf.ts";

type SessionCookieSameSite = 
    "strict" | "lax" | "none";

function setSessionCookie(
    response: Response,
    token: string,
): void {
    response.cookie(
        env.SESSION_COOKIE_NAME,
        token,
        {
            httpOnly: true,
            secure: env.SESSION_COOKIE_SECURE,
            sameSite: env.SESSION_COOKIE_SAME_SITE as SessionCookieSameSite,
            maxAge: env.SESSION_TTL_DAYS *
                24 * 60 * 60 * 1000,
            path: "/",
        },
    );
}

function clearSessionCookie(
    response: Response,
): void {
    response.clearCookie(
        env.SESSION_COOKIE_NAME,
        {
            httpOnly: true,
            secure: env.SESSION_COOKIE_SECURE,
            sameSite: env.SESSION_COOKIE_SAME_SITE as SessionCookieSameSite,
            path: "/",
        },
    );
}


function getMetadata(
    request: Request,
) {
    const userAgent = request.get(
        "user-agent",
    );

    const ipAddress = request.ip;

    return {
        ...(userAgent !== undefined
            ? { userAgent }
            : {}),
        ...(ipAddress !== undefined
            ? { ipAddress }
            : {}),
    };
}

export async function register(
    request: Request,
    response: Response,
): Promise<void> {
    const input = registerSchema.parse(
        request.body,
    );

    const result = await registerUser(
        input,
        getMetadata(request),
    );

    response.status(201).json({
        success: true,
        data: {
            user: result.user,
            requiresEmailVerification:
                result.requiresEmailVerification,
        },
        message:
            "Registration successful. Please verify your email address.",
    });
}

export async function login(
    request: Request,
    response: Response,
): Promise<void> {
    const input = loginSchema.parse(
        request.body,
    );

    const result = await loginUser(
        input,
        getMetadata(request),
    );

    setSessionCookie(
        response,
        result.token,
    );

    response.status(200).json({
        success: true,
        data: {
            user: result.user,
        },
        message: "Login successful.",
    });
}

export async function verifyEmailCode(
    request: Request,
    response: Response,
): Promise<void> {
    const input =
        verifyEmailCodeSchema.parse(
            request.body,
        );

    const user = await verifyEmailByCode(
        input.email,
        input.code,
    );

    response.status(200).json({
        success: true,
        data: {
            user,
        },
        message:
            "Email address verified successfully.",
    });
}

export async function verifyEmailToken(
    request: Request,
    response: Response,
): Promise<void> {
    const input =
        verifyEmailTokenSchema.parse(
            request.query,
        );

    const user = await verifyEmailByToken(
        input.token,
    );

    response.status(200).json({
        success: true,
        data: {
            user,
        },
        message:
            "Email address verified successfully.",
    });
}

export async function resendVerification(
    request: Request,
    response: Response,
): Promise<void> {
    const input =
        resendVerificationSchema.parse(
            request.body,
        );

    await resendVerificationEmail(
        input.email,
    );

    response.status(200).json({
        success: true,
        message:
            "If an unverified account exists for that email, a verification message has been sent.",
    });
}

export async function me(
    request: Request,
    response: Response,
): Promise<void> {
    const token =
        request.cookies?.[
            env.SESSION_COOKIE_NAME
        ];

    if (!token) {
        clearSessionCookie(response);

        response.status(401).json({
            success: false,
            message: "Not authenticated.",
        });

        return;
    }

    const user = await getUserFromSession(
        token,
    );

    if (!user) {
        clearSessionCookie(response);

        response.status(401).json({
            success: false,
            message:
                "Session expired or invalid.",
        });

        return;
    }

    response.status(200).json({
        success: true,
        data: {
            user,
        },
    });
}

export async function logout(
    request: Request,
    response: Response,
): Promise<void> {
    const token =
        request.cookies?.[
            env.SESSION_COOKIE_NAME
        ];

    if (token) {
        await logoutUser(token, getMetadata(request));
    }

    clearSessionCookie(response);

    response.status(200).json({
        success: true,
        message: "Logged out successfully.",
    });
}

export async function forgotPasswordController(
    request: Request,
    response: Response,
): Promise<void> {
    const input =
        forgotPasswordSchema.parse(
            request.body,
        );

    await forgotPassword(input.email);

    response.status(202).json({
        success: true,
        message:
            "If an account exists for that email, password reset instructions have been sent.",
    });
}

export async function resetPasswordController(
    request: Request,
    response: Response,
): Promise<void> {
    const input =
        resetPasswordSchema.parse(
            request.body,
        );

    await resetUserPassword(
        input.token,
        input.newPassword,
    );

    clearSessionCookie(response);

    response.status(200).json({
        success: true,
        message:
            "Password reset successfully. Please log in again.",
    });
}

export async function changePassword(
    request: Request,
    response: Response,
): Promise<void> {
    const user = request.user;

    if (!user) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });

        return;
    }

    const input =
        changePasswordSchema.parse(
            request.body,
        );

    await changeUserPassword(
        user.id,
        input.currentPassword,
        input.newPassword,
    );

    clearSessionCookie(response);

    response.status(200).json({
        success: true,
        message:
            "Password changed successfully. Please log in again.",
    });
}

export async function listSessions(
    request: Request,
    response: Response,
): Promise<void> {
    const user = request.user;

    if (!user) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });

        return;
    }

    const currentToken =
        request.cookies?.[
            env.SESSION_COOKIE_NAME
        ];

    const sessions = await getSessions(
        user.id,
        currentToken,
    );

    response.status(200).json({
        success: true,
        data: {
            sessions,
        },
    });
}

export async function revokeSessionController(
    request: Request,
    response: Response,
): Promise<void> {
    const user = request.user;

    if (!user) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });

        return;
    }

    const input = sessionIdSchema.parse(
        request.params,
    );

    await revokeSession(
        user.id,
        input.sessionId,
    );

    response.status(200).json({
        success: true,
        message:
            "Session revoked successfully.",
    });
}

export async function revokeAllSessionsController(
    request: Request,
    response: Response,
): Promise<void> {
    const user = request.user;

    if (!user) {
        response.status(401).json({
            success: false,
            message: "Authentication required.",
        });

        return;
    }

    const count = await revokeAllSessions(
        user.id,
    );

    clearSessionCookie(response);

    response.status(200).json({
        success: true,
        data: {
            revokedCount: count,
        },
        message:
            "All sessions have been revoked.",
    });
}

export async function getCsrfToken(
    request: Request,
    response: Response,
): Promise<void> {
    const sessionToken = request.cookies?.[
        env.SESSION_COOKIE_NAME
    ];

    if (!sessionToken) {
        response.status(401).json({
            success: false,
            error: {
                code:
                    "AUTHENTICATION_REQUIRED",
                message:
                    "Authentication required.",
            },
        });

        return;
    }

    const user = await getUserFromSession(
        sessionToken,
    );

    if (!user) {
        clearSessionCookie(response);

        response.status(401).json({
            success: false,
            error: {
                code:
                    "INVALID_SESSION",
                message:
                    "Your session is invalid or has expired.",
            },
        });

        return;
    }

    response
        .setHeader(
            "Cache-Control",
            "no-store",
        )
        .status(200)
        .json({
            success: true,
            data: {
                csrfToken:
                    createCsrfToken(
                        sessionToken,
                    ),
            },
        });
}
