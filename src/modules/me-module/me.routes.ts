import {
    Router,
} from "express";

import {
    requireAuth,
} from "../../middleware/admin-middleware/auth.middleware.ts";

import {
    requireCsrfToken,
} from "../../middleware/csrf.middleware.ts";

import {
    validate,
} from "../../middleware/validate.middleware.ts";

import {
    deleteAccount,
    getMe,
    getPrivacy,
    patchMe,
    patchPrivacy,
} from "./me.controller.ts";

import {
    updateMeSchema,
    updatePrivacySchema,
} from "./me.validation.ts";

const router = Router();

/**
 * GET /me
 *
 * Retrieves the authenticated user's account
 * and privacy settings.
 */
router.get(
    "/",
    requireAuth,
    getMe,
);

/**
 * PATCH /me
 *
 * Updates the authenticated user's profile.
 */
router.patch(
    "/",
    requireAuth,
    requireCsrfToken,
    validate(updateMeSchema),
    patchMe,
);

/**
 * GET /me/privacy
 *
 * Retrieves the authenticated user's privacy settings.
 */
router.get(
    "/privacy",
    requireAuth,
    getPrivacy,
);

/**
 * PATCH /me/privacy
 *
 * Updates the authenticated user's privacy settings.
 */
router.patch(
    "/privacy",
    requireAuth,
    requireCsrfToken,
    validate(updatePrivacySchema),
    patchPrivacy,
);

/**
 * DELETE /me
 *
 * Soft-deletes and anonymizes the authenticated user's account.
 */
router.delete(
    "/",
    requireAuth,
    requireCsrfToken,
    deleteAccount,
);

export default router;