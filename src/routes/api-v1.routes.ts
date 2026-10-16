import { Router } from "express";

import publicRoutes from "./public/public.routes.ts";
import adminRoutes from "./admin/admin.routes.ts";

const router = Router();

/*
 * Customer-facing API
 */
router.use(
    "/",
    publicRoutes,
);

/*
 * Administrative API
 */
router.use(
    "/admin",
    adminRoutes,
);

export default router;