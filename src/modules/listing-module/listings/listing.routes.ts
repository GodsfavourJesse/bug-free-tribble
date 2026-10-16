import { Router } from "express";

import {
    addImage,
    create,
    dashboard,
    getById,
    markSold,
    reactivate,
    remove,
    restore,
    search,
    submitForReview,
    update,
} from "./listing.controller.ts";

import {
    addFavorite,
    getFavoriteStatus,
    getFavorites,
    removeFavorite,
} from "../listing-favorite/listing-favorite.controller.ts";

import { requireAuth } from "../../../middleware/admin-middleware/auth.middleware.ts";

import { requireCsrfToken } from "../../../middleware/csrf.middleware.ts";

import { ensureVisitorIdentity } from "../../../middleware/visitor.middleware.ts";

import { recordShare } from "../listing-share/listing-share.controller.ts";

import { reportListing } from "../listing-report/listing-report.controller.ts";

import { contactSeller } from "../listing-contact/listing-contact.controller.ts";

import { uploadRateLimiter } from "../../../middleware/rate-limit.middleware.ts";

import { imageUpload } from "../../../middleware/upload.middleware.ts";

const router = Router();

/**
 * =========================================================
 * PUBLIC ROUTES
 * =========================================================
 */

router.get("/search", search);

/**
 * =========================================================
 * AUTHENTICATED STATIC ROUTES
 * =========================================================
 */

router.post("/", requireAuth, requireCsrfToken, create);

router.get("/dashboard", requireAuth, dashboard);

router.get("/favorites", requireAuth, getFavorites);

/**
 * =========================================================
 * FAVORITES
 * =========================================================
 */

router.get("/:id/favorite", requireAuth, getFavoriteStatus);

router.post("/:id/favorite", requireAuth, requireCsrfToken, addFavorite);

router.delete("/:id/favorite", requireAuth, requireCsrfToken, removeFavorite);

/**
 * =========================================================
 * REPORTING
 * =========================================================
 */

router.post("/:id/report", requireAuth, requireCsrfToken, reportListing);

/**
 * =========================================================
 * SHARE TRACKING
 * =========================================================
 */

router.post("/:id/share", requireCsrfToken, ensureVisitorIdentity, recordShare);

router.post("/:id/contact", requireAuth, requireCsrfToken, contactSeller);

/**
 * =========================================================
 * LISTING LIFECYCLE
 * =========================================================
 */

router.post("/:id/submit", requireAuth, requireCsrfToken, submitForReview);

router.post("/:id/restore", requireAuth, requireCsrfToken, restore);

router.post("/:id/reactivate", requireAuth, requireCsrfToken, reactivate);

router.post("/:id/sold", requireAuth, requireCsrfToken, markSold);

router.post(
    "/:id/images",
    requireAuth,
    requireCsrfToken,
    uploadRateLimiter,
    imageUpload.single("file"),
    addImage,
);

router.patch("/:id", requireAuth, requireCsrfToken, update);

router.delete("/:id", requireAuth, requireCsrfToken, remove);

/**
 * =========================================================
 * PUBLIC LISTING DETAIL
 * =========================================================
 *
 * Keep this LAST because /:id is a generic parameter route.
 */

router.get("/:id", ensureVisitorIdentity, getById);

export default router;