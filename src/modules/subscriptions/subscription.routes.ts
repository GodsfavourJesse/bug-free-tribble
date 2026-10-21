import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.ts";
import {
    current,
    plans,
    price,
} from "./subscription.controller.ts";

const router = Router();

// Plans are public so the frontend can display available subscription options before login.
router.get("/plans", plans);
router.get("/current", requireAuth, current);
router.get("/plans/:planId/price", requireAuth, price);

export default router;
