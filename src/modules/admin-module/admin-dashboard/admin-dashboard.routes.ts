import { Router } from "express";

import { requireAdminAuth } from "../../../middleware/admin-middleware/admin-auth.middleware.ts";
import { requirePermission } from "../../../middleware/admin-middleware/admin.middleware.ts";

import {
    dashboard,
    systemHealth,
} from "./admin-dashboard.controller.ts";

const router = Router();

router.use(requireAdminAuth);

router.get(
    "/",
    requirePermission("dashboard:view"),
    dashboard,
);

router.get(
    "/system-health",
    requirePermission("dashboard:view"),
    systemHealth,
);

export default router;
