import { Router } from "express";

import {
    getCreditBalanceController,
    getCreditHistoryController,
} from "./credit.controller.ts";

import { requireAuth } from "../../middleware/admin-middleware/auth.middleware.ts";

const router = Router();

/**
 * GET /api/v1/credits/balance
 *
 * Returns the authenticated user's listing-credit balance.
 */
router.get(
    "/balance",
    requireAuth,
    getCreditBalanceController,
);

/**
 * GET /api/v1/credits/history?page=1&limit=20
 *
 * Returns the authenticated user's paginated credit history.
 */
router.get(
    "/history",
    requireAuth,
    getCreditHistoryController,
);

export default router;