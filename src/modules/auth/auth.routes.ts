import { Router } from "express";

import {
    authRateLimiter,
} from "../../middleware/rate-limit.middleware.ts";

import {
    requireAuth,
} from "../../middleware/admin-middleware/auth.middleware.ts";

import {
    validate,
} from "../../middleware/validate.middleware.ts";

import {
    changePassword,
    forgotPasswordController,
    getCsrfToken,
    listSessions,
    login,
    logout,
    me,
    register,
    resendVerification,
    resetPasswordController,
    revokeAllSessionsController,
    revokeSessionController,
    verifyEmailCode,
    verifyEmailToken,
} from "./auth.controller.ts";

import {
    changePasswordSchema,
    forgotPasswordSchema,
    loginSchema,
    registerSchema,
    resendVerificationSchema,
    resetPasswordSchema,
    sessionIdSchema,
    verifyEmailCodeSchema,
    verifyEmailTokenSchema,
} from "./auth.validation.ts";

const router = Router();

/*
 * Registration
 */
router.post(
    "/register",
    authRateLimiter,
    validate(
        registerSchema,
        "body",
    ),
    register,
);

/*
 * Login
 */
router.post(
    "/login",
    authRateLimiter,
    validate(
        loginSchema,
        "body",
    ),
    login,
);

/*
 * Email verification
 */
router.post(
    "/verify-email",
    authRateLimiter,
    validate(
        verifyEmailCodeSchema,
        "body",
    ),
    verifyEmailCode,
);

router.get(
    "/verify-email",
    authRateLimiter,
    validate(
        verifyEmailTokenSchema,
        "query",
    ),
    verifyEmailToken,
);

router.post(
    "/verify-email/resend",
    authRateLimiter,
    validate(
        resendVerificationSchema,
        "body",
    ),
    resendVerification,
);

/*
 * Password recovery
 */
router.post(
    "/forgot-password",
    authRateLimiter,
    validate(
        forgotPasswordSchema,
        "body",
    ),
    forgotPasswordController,
);

router.post(
    "/reset-password",
    authRateLimiter,
    validate(
        resetPasswordSchema,
        "body",
    ),
    resetPasswordController,
);

/*
 * Current session/user
 */
router.get(
    "/me",
    requireAuth,
    me,
);

router.post(
    "/logout",
    requireAuth,
    logout,
);

/*
 * Password change
 */
router.post(
    "/change-password",
    requireAuth,
    validate(
        changePasswordSchema,
        "body",
    ),
    changePassword,
);

/*
 * Session management
 */
router.get(
    "/sessions",
    requireAuth,
    listSessions,
);

router.delete(
    "/sessions/:sessionId",
    requireAuth,
    validate(
        sessionIdSchema,
        "params",
    ),
    revokeSessionController,
);

router.post(
    "/sessions/revoke-all",
    requireAuth,
    revokeAllSessionsController,
);

router.get(
    "/csrf-token",
    requireAuth,
    getCsrfToken,
);

export default router;