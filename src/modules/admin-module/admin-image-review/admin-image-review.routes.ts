import {
    Router,
} from "express";

import {
    requireAdminAuth,
} from "../../../middleware/admin-middleware/admin-auth.middleware.ts";

import {
    requirePermission,
} from "../../../middleware/admin-middleware/admin.middleware.ts";

import {
    getAdminImageReviewController,
    listAdminImageReviewsController,
    recordAdminImageReviewDecisionController,
    retryAdminImageAnalysisController,
} from "./admin-image-review.controller.ts";

const router = Router();

/**
 * All routes in this module require
 * an authenticated administrator.
 */
router.use(
    requireAdminAuth,
);

/**
 * List images for administrator review.
 *
 * Permission: listing:view
 * GET /api/v1/admin/image-review
 */
router.get(
    "/",
    requirePermission("listing:view"),
    listAdminImageReviewsController,
);

/**
 * Retrieve an image, its automated analysis,
 * and its human-review history.
 *
 * Permission: listing:view
 * GET /api/v1/admin/image-review/:imageId
 */
router.get(
    "/:imageId",
    requirePermission("listing:view"),
    getAdminImageReviewController,
);

/**
 * Record a human-review decision.
 *
 * Permission: listing:review
 * POST /api/v1/admin/image-review/:imageId/decision
 */
router.post(
    "/:imageId/decision",
    requirePermission("listing:review"),
    recordAdminImageReviewDecisionController,
);

/**
 * Queue another automated image analysis.
 *
 * Permission: listing:review
 * POST /api/v1/admin/image-review/:imageId/retry
 */
router.post(
    "/:imageId/retry",
    requirePermission("listing:review"),
    retryAdminImageAnalysisController,
);

export default router;