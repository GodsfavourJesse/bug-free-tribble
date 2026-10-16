import { Router } from "express";

import { requireAuth } from "../../../middleware/admin-middleware/auth.middleware.ts";

import {
    createFavorite,
    deleteFavorite,
    getFavoriteStatus,
    getFavorites,
} from "./marketplace-favorites.controller.ts";

const router = Router();

/**
 * All favorites endpoints require authentication.
 */
router.use(requireAuth);

/**
 * GET /api/v1/marketplace/favorites
 *
 * Retrieve the authenticated user's favorites.
 */
router.get(
    "/",
    getFavorites,
);

/**
 * POST /api/v1/marketplace/favorites/:listingId
 *
 * Add a listing to favorites.
 */
router.post(
    "/:listingId",
    createFavorite,
);

/**
 * DELETE /api/v1/marketplace/favorites/:listingId
 *
 * Remove a listing from favorites.
 */
router.delete(
    "/:listingId",
    deleteFavorite,
);

/**
 * GET /api/v1/marketplace/favorites/:listingId
 *
 * Check whether a listing is a favorite.
 */
router.get(
    "/:listingId",
    getFavoriteStatus,
);

export default router;