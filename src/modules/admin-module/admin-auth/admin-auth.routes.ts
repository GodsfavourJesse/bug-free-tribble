import {
    Router,
} from "express";

import {
    validate,
} from "../../../middleware/validate.middleware.ts";


import {
    adminLoginSchema,
} from "./admin-auth.validation.ts";

import {
    getAdminCsrfTokenController,
    loginAdminController,
    getAdminMeController,
    logoutAdminController,
} from "./admin-auth.controller.ts";
import { requireAdminAuth } from "../../../middleware/admin-middleware/admin-auth.middleware.ts";
import { requireAdminCsrfToken } from "../../../middleware/admin-middleware/admin-csrf.middleware.ts";
import { getAdminSecurityChallengeController, startAdminSecurityChallengeController, submitAdminSecurityChallengeAnswerController } from "./admin-security-challenge/admin-security-challenge.controller.ts";
import { getAdminSecurityChallengeSchema, submitAdminSecurityChallengeAnswerSchema } from "./admin-security-challenge/admin-security-challenge.validation.ts";
import { adminChallengeInteractionRateLimiter, adminChallengeStartRateLimiter, adminLoginRateLimiter } from "../../../middleware/rate-limit.middleware.ts";

const router = Router();


/**
 * Public administrator security-awareness challenge.
 *
 * These endpoints do not authenticate administrators.
 * The login service must independently enforce challenge
 * completion before issuing an administrator session.
 */
router.post(
    "/security-challenge/start",
    adminChallengeStartRateLimiter,
    startAdminSecurityChallengeController,
);

router.post(
    "/security-challenge/current",
    adminChallengeInteractionRateLimiter,
    validate(getAdminSecurityChallengeSchema),
    getAdminSecurityChallengeController,
);

router.post(
    "/security-challenge/answer",
    adminChallengeInteractionRateLimiter,
    validate(submitAdminSecurityChallengeAnswerSchema),
    submitAdminSecurityChallengeAnswerController,
);


/**
 * Public administrator login.
 */
router.post(
    "/login",
    adminLoginRateLimiter,
    validate(adminLoginSchema),
    loginAdminController,
);

/**
 * Current administrator.
 */
router.get(
    "/me",
    requireAdminAuth,
    getAdminMeController,
);

/**
 * Issue a CSRF token for the current administrator session.
 */
router.get(
    "/csrf-token",
    requireAdminAuth,
    getAdminCsrfTokenController,
);

/**
 * Administrator logout.
 */
router.post(
    "/logout",
    requireAdminAuth,
    requireAdminCsrfToken,
    logoutAdminController,
);

export default router;