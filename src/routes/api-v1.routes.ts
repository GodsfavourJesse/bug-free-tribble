import { Router } from "express";

import publicRoutes from "./public/public.routes.ts";
import adminRoutes from "./admin/admin.routes.ts";

const router = Router();

router.get("/__api-debug", (_req, res) => {
    res.json({
        success: true,
        message: "API v1 router is working",
    });
});

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