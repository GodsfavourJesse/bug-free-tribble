import { Router } from "express";

import {
    requireAuth,
} from "../../middleware/auth.middleware.ts";

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
    getMyApplications,
    getMyProfile,
    getPublicDealersDirectory,
    getPublicListings,
    getPublicProfile,
    listDocuments,
    removeDocument,
    updateMyBio,
    uploadDocument,
    uploadMyCoverPhoto,
    uploadMyProfilePicture,
} from "./dealer.controller.ts";

import {
    uploadRateLimiter,
} from "../../middleware/rate-limit.middleware.ts";
import { dealerCoverPhotoUpload, dealerProfilePictureUpload } from "../../middleware/dealer-profile-image-upload.middleware.ts";

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
 * Public directory of verified dealers.
 */
router.get(
    "/",
    getPublicDealersDirectory,
);

/**
 * Public dealer listings.
 */
router.get(
    "/:dealerId/listings",
    getPublicListings,
);

/**
 * Authenticated user's dealer application history.
 */
router.get(
    "/applications/me",
    requireAuth,
    getMyApplications,
);

/**
 * Get the authenticated dealer's editable profile.
 */
router.get(
    "/me/profile",
    requireAuth,
    getMyProfile,
);

/**
 * Update the authenticated dealer's bio.
 */
router.patch(
    "/me/profile",
    requireAuth,
    requireCsrfToken,
    updateMyBio,
);

/**
 * Upload or replace the dealer's profile picture.
 */
router.post(
    "/me/profile-picture",
    requireAuth,
    requireCsrfToken,
    uploadRateLimiter,
    dealerProfilePictureUpload.single("file"),
    uploadMyProfilePicture,
);

/**
 * Upload or replace the dealer's cover photo.
 */
router.post(
    "/me/cover-photo",
    requireAuth,
    requireCsrfToken,
    uploadRateLimiter,
    dealerCoverPhotoUpload.single("file"),
    uploadMyCoverPhoto,
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