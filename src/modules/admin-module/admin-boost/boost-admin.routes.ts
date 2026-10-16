import { Router } from "express";

import {
    requireAdminAuth,
} from "../../../middleware/admin-middleware/admin-auth.middleware.ts";

import {
    requirePermission,
} from "../../../middleware/admin-middleware/admin.middleware.ts";

import {
    adminApproveBoost,
    adminGetBoostDetails,
    adminListBoosts,
    adminRejectBoost,
} from "./boost-admin.controller.ts";

const router = Router();

/*
 * All endpoints require authentication.
 */
router.use(requireAdminAuth);

/*
 * GET /admin/boosts
 */
router.get(
    "/",
    requirePermission("boost:manage"),
    adminListBoosts,
);

/*
 * GET /admin/boosts/:boostId
 */
router.get(
    "/:boostId",
    requirePermission("boost:manage"),
    adminGetBoostDetails,
);

/*
 * PATCH /admin/boosts/:boostId/approve
 */
router.patch(
    "/:boostId/approve",
    requirePermission("boost:manage"),
    adminApproveBoost,
);

/*
 * PATCH /admin/boosts/:boostId/reject
 */
router.patch(
    "/:boostId/reject",
    requirePermission("boost:manage"),
    adminRejectBoost,
);

export default router;