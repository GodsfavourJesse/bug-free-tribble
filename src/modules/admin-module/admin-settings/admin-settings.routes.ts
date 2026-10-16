import { Router } from "express";

import {
    requireAdminAuth,
} from "../../../middleware/admin-middleware/admin-auth.middleware.ts";

import {
    requirePermission,
} from "../../../middleware/admin-middleware/admin.middleware.ts";

import {
    getCommercialSettingsController,
    getSettingsByCategoryController,
    getSettingsHistoryController,
    getSettingsOverviewController,
    updateCommercialSettingsController,
} from "./admin-settings.controller.ts";

const router = Router();

router.use(requireAdminAuth);

router.get(
    "/",
    requirePermission("subscription:manage"),
    getSettingsOverviewController,
);

router.get(
    "/category/:category",
    requirePermission("subscription:manage"),
    getSettingsByCategoryController,
);

router.get(
    "/commercial",
    requirePermission("subscription:manage"),
    getCommercialSettingsController,
);

router.patch(
    "/commercial",
    requirePermission("subscription:manage"),
    updateCommercialSettingsController,
);

router.get(
    "/history",
    requirePermission("subscription:manage"),
    getSettingsHistoryController,
);

export default router;