import { Router } from "express";

import {
    requireAdminAuth,
} from "../../../middleware/admin-middleware/admin-auth.middleware.ts";

import {
    requirePermission,
} from "../../../middleware/admin-middleware/admin.middleware.ts";

import {
    createSubscriptionPlan,
    plans,
    subscriptionsList,
    updateSubscriptionPlan,
} from "./admin-subscription.controller.ts";
import { subscriptionHistoryList } from "./admin-subscription-history/admin-subscription-history.controller.ts";

const router = Router();

router.use(requireAdminAuth);

// Subscription records
router.get(
    "/",
    requirePermission("subscription:view"),
    subscriptionsList,
);

// Individual subscription history
router.get(
    "/:subscriptionId/history",
    requirePermission("subscription:view"),
    subscriptionHistoryList,
);

// Subscription plans
router.get(
    "/subscription-plans",
    requirePermission("subscription:manage"),
    plans,
);

router.post(
    "/subscription-plans",
    requirePermission("subscription:manage"),
    createSubscriptionPlan,
);

router.patch(
    "/subscription-plans/:planId",
    requirePermission("subscription:manage"),
    updateSubscriptionPlan,
);

export default router;