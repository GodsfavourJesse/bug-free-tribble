import { Router } from "express";

import {
    requireAuth,
} from "../../middleware/auth.middleware.ts";

import {
    requireCsrfToken,
} from "../../middleware/csrf.middleware.ts";

import {
    cancel,
    create,
    history,
    plans,
} from "./boost.controller.ts";

const router = Router();

/**
 * Public boost plans.
 */
router.get(
    "/plans",
    plans,
);

/**
 * Request a listing boost.
 */
router.post(
    "/",
    requireAuth,
    requireCsrfToken,
    create,
);

/**
 * Cancel a boost.
 */
router.post(
    "/:boostId/cancel",
    requireAuth,
    requireCsrfToken,
    cancel,
);

/**
 * Retrieve the authenticated user's boost history.
 */
router.get(
    "/history",
    requireAuth,
    history,
);

export default router;