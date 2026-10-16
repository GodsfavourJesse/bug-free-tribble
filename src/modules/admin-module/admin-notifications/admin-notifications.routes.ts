import { Router } from "express";

import { requireAdminAuth } from "../../../middleware/admin-middleware/admin-auth.middleware.ts";
import { requirePermission } from "../../../middleware/admin-middleware/admin.middleware.ts";

import {
    getAdminUnreadCount,
    listAdminNotifications,
    markAdminNotificationRead,
    markAllAdminNotificationsRead,
} from "./admin-notifications.controller.ts";

const router = Router();

router.use(requireAdminAuth, requirePermission("dashboard:view"));

router.get("/", listAdminNotifications);

router.get("/unread-count", getAdminUnreadCount);

router.post("/read-all", markAllAdminNotificationsRead);

router.patch("/:notificationId/read", markAdminNotificationRead);

export default router;