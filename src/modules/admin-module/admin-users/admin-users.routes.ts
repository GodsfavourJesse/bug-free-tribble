import { Router } from "express";

import { requireAdminAuth } from "../../../middleware/admin-middleware/admin-auth.middleware.ts";
import { requirePermission } from "../../../middleware/admin-middleware/admin.middleware.ts";

import {
    deleteAdminUser,
    setAdminUserRoles,
    suspendAdminUser,
    unsuspendAdminUser,
} from "./admin-user-actions.controller.ts";

import {
    getAdminUserController,
    getAdminUserStatsController,
    listAdminUsersController,
} from "./admin-users.controller.ts";

const router = Router();

router.use(
    requireAdminAuth,
    requirePermission("user:view"),
);

router.get(
    "/",
    listAdminUsersController,
);

router.get(
    "/stats",
    getAdminUserStatsController,
);

router.get(
    "/:userId",
    getAdminUserController,
);

router.post(
    "/:userId/suspend",
    requirePermission("user:suspend"),
    suspendAdminUser,
);

router.post(
    "/:userId/unsuspend",
    requirePermission("user:suspend"),
    unsuspendAdminUser,
);

router.delete(
    "/:userId",
    requirePermission("user:delete"),
    deleteAdminUser,
);

router.patch(
    "/:userId/roles",
    requirePermission("user:role:manage"),
    setAdminUserRoles,
);

export default router;
