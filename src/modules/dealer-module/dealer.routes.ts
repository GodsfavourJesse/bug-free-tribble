import { Router } from "express";

import {
    requireAuth,
} from "../../middleware/admin-middleware/auth.middleware.ts";

import {
    requireCsrfToken,
} from "../../middleware/csrf.middleware.ts";

import {
    dealerDocumentUpload,
} from "../../middleware/dealer-document-upload.middleware.ts";

import {
    apply,
    getDocumentUrl,
    getMyAnalytics,
    getPublicListings,
    getPublicProfile,
    listDocuments,
    removeDocument,
    uploadDocument,
} from "./dealer.controller.ts";

import {
    uploadRateLimiter,
} from "../../middleware/rate-limit.middleware.ts";

const router = Router();

/**
 * Authenticated dealer analytics.
 */
router.get(
    "/me/analytics",
    requireAuth,
    getMyAnalytics,
);

/**
 * Public dealer listings.
 */
router.get(
    "/:dealerId/listings",
    getPublicListings,
);

/**
 * Public dealer profile.
 */
router.get(
    "/:dealerId",
    getPublicProfile,
);

/**
 * Submit a dealer application.
 */
router.post(
    "/apply",
    requireAuth,
    requireCsrfToken,
    apply,
);

/**
 * Upload a document for a dealer application.
 */
router.post(
    "/applications/:applicationId/documents",
    requireAuth,
    requireCsrfToken,
    uploadRateLimiter,
    dealerDocumentUpload.single("file"),
    uploadDocument,
);

/**
 * List documents for an application.
 */
router.get(
    "/applications/:applicationId/documents",
    requireAuth,
    listDocuments,
);

/**
 * Generate a temporary URL for a dealer document.
 */
router.get(
    "/documents/:documentId/url",
    requireAuth,
    getDocumentUrl,
);

/**
 * Remove a dealer document.
 */
router.delete(
    "/documents/:documentId",
    requireAuth,
    requireCsrfToken,
    removeDocument,
);

export default router;