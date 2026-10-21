import { Router } from "express";
import { requireAuth } from "../../../middleware/auth.middleware.ts";

import {
    createSavedSearchController,
    deleteSavedSearchController,
    executeSavedSearchController,
    getSavedSearchController,
    listSavedSearchesController,
    updateSavedSearchController,
} from "./saved-searches.controller.ts";


const router = Router();

/**
 * All saved-search routes require authentication.
 */
router.use(requireAuth);

/**
 * POST /
 * Create a saved search.
 */
router.post(
    "/",
    createSavedSearchController,
);

/**
 * GET /
 * List the authenticated user's saved searches.
 */
router.get(
    "/",
    listSavedSearchesController,
);

/**
 * GET /:id/results
 * Execute a saved search against current listings.
 *
 * Register this before /:id for clarity.
 */
router.get(
    "/:id/results",
    executeSavedSearchController,
);

/**
 * GET /:id
 * Retrieve one saved search.
 */
router.get(
    "/:id",
    getSavedSearchController,
);

/**
 * PATCH /:id
 * Update a saved search.
 */
router.patch(
    "/:id",
    updateSavedSearchController,
);

/**
 * DELETE /:id
 * Delete a saved search.
 */
router.delete(
    "/:id",
    deleteSavedSearchController,
);

export default router;