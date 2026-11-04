import { Router } from "express";

import {
    featured,
    search,
} from "./marketplace.controller.ts";

import marketplaceFavoritesRoutes from "./marketplace-favorites/marketplace-favorites.routes.ts";
import marketplaceSavedSearchesRoutes from "./marketplace-saved-searches/saved-searches.routes.ts";
import { getListingDetails } from "./marketplace-details/marketplace-details.controller.ts";
import { ensureVisitorIdentity } from "../../middleware/visitor.middleware.ts";

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
 * Public featured marketplace listings.
 *
 * GET /api/v1/marketplace/featured
 */
router.get(
    "/featured",
    featured,
);

router.get(
    "/listings/:listingId",
    ensureVisitorIdentity,
    getListingDetails,
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