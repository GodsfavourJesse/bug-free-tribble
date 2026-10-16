import { Router } from "express";

import { requireAdminAuth } from "../../../middleware/admin-middleware/admin-auth.middleware.ts";
import { requirePermission } from "../../../middleware/admin-middleware/admin.middleware.ts";

import {
    failedPayments,
    payments,
    reconciliations,
    refunds,
    retryReconciliation,
} from "./payments/admin-payment.controller.ts";

import {
    executeRefund,
    reviewRefund,
} from "./refunds/admin-refund.controller.ts";

const router = Router();

router.use(requireAdminAuth);

router.get(
    "/",
    requirePermission("payment:view"),
    payments,
);

router.get(
    "/transactions",
    requirePermission("payment:view"),
    payments,
);

router.get(
    "/failed",
    requirePermission("payment:view"),
    failedPayments,
);

router.get(
    "/refunds",
    requirePermission("payment:view"),
    refunds,
);

router.post(
    "/refunds/:refundId/review",
    requirePermission("payment:refund"),
    reviewRefund,
);

router.post(
    "/refunds/:refundId/execute",
    requirePermission("payment:refund:execute"),
    executeRefund,
);

router.get(
    "/reconciliation",
    requirePermission("payment:view"),
    reconciliations,
);

router.post(
    "/reconciliation/:reconciliationId/retry",
    requirePermission("payment:reconcile"),
    retryReconciliation,
);

export default router;
