import { Router } from "express";
import adminAuthRoutes from "../../modules/admin-module/admin-auth/admin-auth.routes.ts";
import adminDashboardRoutes from "../../modules/admin-module/admin-dashboard/admin-dashboard.routes.ts";

// import adminRoutes from "../../modules/admin-module/admin.routes.ts";
import adminDealerRoutes from "../../modules/admin-module/admin-dealers/admin-dealer.routes.ts";
import adminSubscriptionRoutes from "../../modules/admin-module/admin-subscription/admin-subscription.routes.ts";
import adminBoostRoutes from "../../modules/admin-module/admin-boost/boost-admin.routes.ts";
import adminUsersRoutes from "../../modules/admin-module/admin-users/admin-users.routes.ts";
import adminImageReviewRoutes from "../../modules/admin-module/admin-image-review/admin-image-review.routes.ts";
import adminListingRoutes from "../../modules/admin-module/admin-listing/admin-listing.routes.ts";
import adminSettingsRoutes from "../../modules/admin-module/admin-settings/admin-settings.routes.ts";
import adminCreditRoutes from "../../modules/admin-module/admin-credit/admin-credit.routes.ts";
import adminMessagingRoutes from "../../modules/admin-module/admin-messaging/admin-messaging.routes.ts";
import adminPaymentsRoutes from "../../modules/admin-module/admin-payments/admin-payments.routes.ts";
import adminNotificationRoutes from "../../modules/admin-module/admin-notifications/admin-notifications.routes.ts";

const router = Router();

// Administrator login, current session, and logout.
router.use("/auth", adminAuthRoutes);

router.use("/dashboard", adminDashboardRoutes);

/*
 * General administration
 *
 * Mounted at /admin.
 */
// router.use(
//     "/",
//     adminRoutes,
// );

/*
 * Dealers
 */
router.use(
    "/dealers",
    adminDealerRoutes,
);


/*
 * Subscription management
 */
router.use(
    "/subscriptions",
    adminSubscriptionRoutes,
);

/*
 * Boost management
 *
 * Administrative boost queue and approval endpoints.
 */
router.use(
    "/boosts",
    adminBoostRoutes,
);

/*
 * User management
 */
router.use(
    "/users",
    adminUsersRoutes,
);

/*
 * Image review
 */
router.use(
    "/image-review",
    adminImageReviewRoutes,
);

/*
 * Listing moderation
 */
router.use(
    "/listings",
    adminListingRoutes,
);

/*
 * Settings
 *
 * This preserves the existing administrative settings
 * endpoint under the admin namespace.
 */
router.use(
    "/settings",
    adminSettingsRoutes,
);

/*
 * Credits
 */
router.use(
    "/credits",
    adminCreditRoutes,
);

/*
 * Messaging and support
 */
router.use(
    "/messaging",
    adminMessagingRoutes,
);

/*
 * Payments and refund execution
 */
router.use(
    "/payments",
    adminPaymentsRoutes,
);

/*
 * Administrator notifications
 */
router.use(
    "/notifications", 
    adminNotificationRoutes
);

export default router;