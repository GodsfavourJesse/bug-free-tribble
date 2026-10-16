import { Router } from "express";

import {
    requireAuth,
} from "../../../middleware/admin-middleware/auth.middleware.ts";

import {
    analyzeListingImage,
    getListingImageAnalysis,
} from "./image-intelligence.controller.ts";

const router = Router();

router.post(
    "/listings/:listingId/images/:imageId/analyze",
    requireAuth,
    analyzeListingImage,
);

router.get(
    "/listings/:listingId/images/:imageId/analysis",
    requireAuth,
    getListingImageAnalysis,
);

export default router;