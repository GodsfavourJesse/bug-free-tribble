import { Router } from "express";

import { requireAdminAuth } from "../../../middleware/admin-middleware/admin-auth.middleware.ts";
import { requirePermission } from "../../../middleware/admin-middleware/admin.middleware.ts";

import {
    listAdminListingsController,
    listAdminListingReportsController,
    resolveAdminListingReportController,
} from "./admin-listing-admin.controller.ts";

import listingModerationRoutes from "./listings-moderation/listing.moderation.routes.ts";

const router = Router();

router.use(requireAdminAuth);

router.get(
    "/",
    requirePermission("listing:view"),
    listAdminListingsController,
);

router.get(
    "/reports",
    requirePermission("listing:view"),
    listAdminListingReportsController,
);

router.patch(
    "/reports/:reportId",
    requirePermission("listing:review"),
    resolveAdminListingReportController,
);

router.use(
    "/moderation",
    listingModerationRoutes,
);

export default router;
