import { Router } from "express";

import {
    requireAuth,
} from "../../middleware/auth.middleware.ts";

import {
    requireCsrfToken,
} from "../../middleware/csrf.middleware.ts";

import {
    history,
    initializeBoost,
    initializeSubscription,
    verifyPayment,
    webhook,
} from "./payment.controller.ts";

const router = Router();

/**
 * Public Paystack webhook.
 *
 * Paystack calls this endpoint directly.
 * Do not apply requireAuth or browser-session CSRF protection.
 *
 * The controller must verify the Paystack signature
 * against the original raw request body.
 */
router.post(
    "/webhook/paystack",
    webhook,
);

/**
 * Customer payment endpoints.
 *
 * All endpoints below require an authenticated user.
 */

/**
 * Initialize a subscription payment.
 */
router.post(
    "/subscriptions/initialize",
    requireAuth,
    requireCsrfToken,
    initializeSubscription,
);

/**
 * Initialize a listing boost payment.
 */
router.post(
    "/boosts/initialize",
    requireAuth,
    requireCsrfToken,
    initializeBoost,
);

/**
 * Verify a payment associated with the authenticated user.
 */
router.post(
    "/verify",
    requireAuth,
    requireCsrfToken,
    verifyPayment,
);

/**
 * Retrieve the authenticated user's payment history.
 */
router.get(
    "/history",
    requireAuth,
    history,
);

export default router;