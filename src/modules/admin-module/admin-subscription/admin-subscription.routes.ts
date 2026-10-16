import { Router } from "express";

import { requireAdminAuth } from "../../../middleware/admin-middleware/admin-auth.middleware.ts";
import { requirePermission } from "../../../middleware/admin-middleware/admin.middleware.ts";

import {
    createSubscriptionPlan,
    plans,
    subscriptionsList,
    updateSubscriptionPlan,
} from "./admin-subscription.controller.ts";

const router = Router();

router.use(requireAdminAuth);

router.get(
    "/",
    requirePermission("subscription:view"),
    subscriptionsList,
);

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
