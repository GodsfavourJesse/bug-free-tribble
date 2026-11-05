import { Router } from "express";

import {
    requireAdminAuth,
} from "../../../middleware/admin-middleware/admin-auth.middleware.ts";

import {
    requirePermission,
} from "../../../middleware/admin-middleware/admin.middleware.ts";

import {
    adminApproveBoost,
    adminCreateBoostPlan,
    adminDeleteBoostPlan,
    adminGetBoostDetails,
    adminListBoostPlans,
    adminListBoosts,
    adminRejectBoost,
    adminUpdateBoostPlan,
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
 * BOOST PLAN MANAGEMENT
 */

/*
 * GET /admin/boosts/plans
 */
router.get(
    "/plans",
    requirePermission("boost:manage"),
    adminListBoostPlans,
);

/*
 * POST /admin/boosts/plans
 */
router.post(
    "/plans",
    requirePermission("boost:manage"),
    adminCreateBoostPlan,
);

/*
 * PATCH /admin/boosts/plans/:planId
 */
router.patch(
    "/plans/:planId",
    requirePermission("boost:manage"),
    adminUpdateBoostPlan,
);

/*
 * DELETE /admin/boosts/plans/:planId
 */
router.delete(
    "/plans/:planId",
    requirePermission("boost:manage"),
    adminDeleteBoostPlan,
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