import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.ts";

import {
    requireCsrfToken,
} from "../../middleware/csrf.middleware.ts";

import {
    register as registerPush,
    unregister as unregisterPush,
} from "./notification-push/push.controller.ts";

import {
    getPreferences,
    list,
    markAllRead,
    markRead,
    preferences,
    unreadCount,
} from "./notification.controller.ts";

const router = Router();

/**
 * All notification endpoints require authentication.
 */
router.use(
    requireAuth,
);

/**
 * List notifications and retrieve the unread count.
 */
router.get(
    "/",
    list,
);

router.get(
    "/unread-count",
    unreadCount,
);

/**
 * Notification preferences.
 */
router.get(
    "/preferences",
    getPreferences,
);

router.patch(
    "/preferences",
    requireCsrfToken,
    preferences,
);

/**
 * Mark individual notifications as read.
 */
router.patch(
    "/:notificationId/read",
    requireCsrfToken,
    markRead,
);

/**
 * Mark all notifications as read.
 */
router.post(
    "/read-all",
    requireCsrfToken,
    markAllRead,
);

/**
 * Register a device for Web Push notifications.
 */
router.post(
    "/push-subscriptions",
    requireCsrfToken,
    registerPush,
);

/**
 * Unregister a device from Web Push notifications.
 */
router.delete(
    "/push-subscriptions",
    requireCsrfToken,
    unregisterPush,
);

export default router;