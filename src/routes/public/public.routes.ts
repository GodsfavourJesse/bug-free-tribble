import { Router } from "express";

import { authRateLimiter } from "../../middleware/rate-limit.middleware.ts";

import authRoutes from "../../modules/auth/auth.routes.ts";
import vehicleRoutes from "../../modules/vehicles-module/vehicle.routes.ts";
import listingRoutes from "../../modules/listing-module/listings/listing.routes.ts";
import imageIntelligenceRoutes from "../../modules/image-module/image-intelligence/image-intelligence.routes.ts";
import marketplaceRoutes from "../../modules/marketplace-module/marketplace.routes.ts";
import dealerRoutes from "../../modules/dealer-module/dealer.routes.ts";
import boostRoutes from "../../modules/boosts-module/boost.routes.ts";
import messagingRoutes from "../../modules/messaging-module/messaging.routes.ts";
import notificationRoutes from "../../modules/notification-module/notification.routes.ts";
import paymentRoutes from "../../modules/payment-module/payment.routes.ts";
import creditRoutes from "../../modules/credits/credit.routes.ts";
import meRoutes from "../../modules/me-module/me.routes.ts";
import subscriptionRoutes from "../../modules/subscriptions/subscription.routes.ts";
import locationRoutes from "../../modules/locations-module/locations.routes.js";

console.log("[DEBUG] PUBLIC ROUTER MODULE LOADED");

const router = Router();

router.get("/__public-debug", (_req, res) => {
    res.json({
        success: true,
        message: "Public router is working",
    });
});

/*
 * Authentication
 */
router.use(
    "/auth",
    authRateLimiter,
    authRoutes,
);

/*
 * Vehicle catalog
 */
router.use(
    "/vehicles",
    vehicleRoutes,
);

/*
 * Listings
 */
router.use(
    "/listings",
    listingRoutes,
);

/*
 * Image intelligence
 */
router.use(
    "/image-intelligence",
    imageIntelligenceRoutes,
);

/*
 * Marketplace
 */
router.use(
    "/marketplace",
    marketplaceRoutes,
);

/*
 * Dealers
 */
router.use(
    "/dealers",
    dealerRoutes,
);

/*
 * Boosts
 */
router.use(
    "/boosts",
    boostRoutes,
);

/*
 * Messaging
 */
router.use(
    "/messaging",
    messagingRoutes,
);

/*
 * Notifications
 */
router.use(
    "/notifications",
    notificationRoutes,
);

/*
 * Subscriptions
 */
router.use(
    "/subscriptions",
    subscriptionRoutes,
);

router.get("/subscriptions/__debug", (_req, res) => {
    res.status(200).json({
        success: true,
        message: "Public subscription routes are mounted",
    });
});

/*
 * Payments
 */
router.use(
    "/payments",
    paymentRoutes,
);

/*
 * Current authenticated user
 */
router.use(
    "/me",
    meRoutes,
);

/*
 * Credits
 */
router.use(
    "/credits",
    creditRoutes,
);

// Locations
router.use("/locations", locationRoutes);

export default router;