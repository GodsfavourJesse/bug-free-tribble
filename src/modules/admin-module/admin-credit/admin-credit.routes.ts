import { Router } from "express";

import {
    requireAdminAuth,
} from "../../../middleware/admin-middleware/admin-auth.middleware.ts";

import {
    requirePermission,
} from "../../../middleware/admin-middleware/admin.middleware.ts";
import { adjustUserListingCreditsController } from "./admin-credit-adjustment/admin-credit-adjustment.controller.ts";
import { reconcileListingCreditsController } from "./credit-reconcilation/credit-reconcilation.controller.ts";


const router = Router();

/*
|--------------------------------------------------------------------------
| Administrator authentication
|--------------------------------------------------------------------------
|
| All routes in this module require an authenticated administrator.
|
*/

router.use(requireAdminAuth);

/*
|--------------------------------------------------------------------------
| Credit adjustment
|--------------------------------------------------------------------------
|
| POST /api/v1/admin/credits/users/:userId/adjust
|
| Required permission: credits:adjust
|
*/

router.post(
    "/users/:userId/adjust",
    requirePermission("credits:adjust"),
    adjustUserListingCreditsController,
);

/*
|--------------------------------------------------------------------------
| Credit reconciliation
|--------------------------------------------------------------------------
|
| GET /api/v1/admin/credits/reconciliation
|
| Required permission: credits:adjust
|
*/

router.get(
    "/reconciliation",
    requirePermission("credits:adjust"),
    reconcileListingCreditsController,
);

export default router;