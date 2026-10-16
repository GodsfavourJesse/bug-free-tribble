import {
    Router,
} from "express";

import {
    requireAdminAuth,
} from "../../../../middleware/admin-middleware/admin-auth.middleware.ts";

import {
    requirePermission,
} from "../../../../middleware/admin-middleware/admin.middleware.ts";

import {
    approve,
    getById,
    pending,
    reject,
    suspend,
} from "./listing.moderation.controller.ts";

const router = Router();

/**
 * All listing-moderation routes require
 * an authenticated administrator.
 */
router.use(
    requireAdminAuth,
);

/**
 * GET /pending
 *
 * Retrieve listings awaiting review.
 */
router.get(
    "/pending",
    requirePermission("listing:view"),
    pending,
);

/**
 * GET /:id
 *
 * Retrieve listing details and moderation history.
 */
router.get(
    "/:id",
    requirePermission("listing:view"),
    getById,
);

/**
 * POST /:id/approve
 *
 * Approve a listing after all image checks pass.
 */
router.post(
    "/:id/approve",
    requirePermission("listing:review"),
    approve,
);

/**
 * POST /:id/reject
 *
 * Reject a listing with a reason.
 */
router.post(
    "/:id/reject",
    requirePermission("listing:review"),
    reject,
);

/**
 * POST /:id/suspend
 *
 * Suspend an approved listing.
 */
router.post(
    "/:id/suspend",
    requirePermission("listing:suspend"),
    suspend,
);

export default router;