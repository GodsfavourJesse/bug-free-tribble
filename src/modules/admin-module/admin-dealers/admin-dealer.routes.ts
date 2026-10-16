import { Router } from "express";

import { requireAdminAuth } from "../../../middleware/admin-middleware/admin-auth.middleware.ts";
import { requirePermission } from "../../../middleware/admin-middleware/admin.middleware.ts";

import {
    dealers,
    reviewDealerApplication,
    reviewDealerVerificationDocument,
} from "./admin-dealer.controller.ts";

const router = Router();

router.use(requireAdminAuth);

// List dealer applications
router.get(
    "/applications",
    requirePermission("dealer:review"),
    dealers,
);

// Approve or reject a dealer application
router.patch(
    "/applications/:applicationId",
    requirePermission("dealer:review"),
    reviewDealerApplication,
);

// Approve or reject an individual verification document
router.patch(
    "/documents/:documentId/review",
    requirePermission("dealer:review"),
    reviewDealerVerificationDocument,
);

export default router;