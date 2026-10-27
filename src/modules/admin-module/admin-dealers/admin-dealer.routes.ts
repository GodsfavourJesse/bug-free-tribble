import { Router } from "express";

import { requireAdminAuth } from "../../../middleware/admin-middleware/admin-auth.middleware.ts";
import { requirePermission } from "../../../middleware/admin-middleware/admin.middleware.ts";

import {
    dealerApplicationHistory,
    dealers,
    previewDealerDocument,
    reviewDealerApplication,
    reviewDealerVerificationDocument,
} from "./admin-dealer.controller.ts";

const router = Router();

router.use(requireAdminAuth);

// DEALER APPLICATION HISTORY
router.get(
    "/applications/history",
    requirePermission("dealer:review"),
    dealerApplicationHistory,
);

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

// Generate a short-lived URL for reviewing a private document
router.get(
    "/documents/:documentId/url",
    requirePermission("dealer:review"),
    previewDealerDocument,
);

export default router;