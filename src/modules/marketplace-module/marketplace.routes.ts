import { Router } from "express";

import {
    search,
} from "./marketplace.controller.ts";

import marketplaceFavoritesRoutes from "./marketplace-favorites/marketplace-favorites.routes.ts";
import marketplaceSavedSearchesRoutes from "./marketplace-saved-searches/saved-searches.routes.ts";

const router = Router();

/**
 * Public marketplace search.
 *
 * GET /api/v1/marketplace/search
 */
router.get(
    "/search",
    search,
);

/**
 * Marketplace favorites.
 *
 * GET    /api/v1/marketplace/favorites
 * POST   /api/v1/marketplace/favorites/:listingId
 * DELETE /api/v1/marketplace/favorites/:listingId
 * GET    /api/v1/marketplace/favorites/:listingId
 */
router.use(
    "/favorites",
    marketplaceFavoritesRoutes,
);

/**
 * Marketplace saved searches.
 *
 * POST   /api/v1/marketplace/saved-searches
 * GET    /api/v1/marketplace/saved-searches
 * GET    /api/v1/marketplace/saved-searches/:id
 * GET    /api/v1/marketplace/saved-searches/:id/results
 * PATCH  /api/v1/marketplace/saved-searches/:id
 * DELETE /api/v1/marketplace/saved-searches/:id
 */
router.use(
    "/saved-searches",
    marketplaceSavedSearchesRoutes,
);

export default router;