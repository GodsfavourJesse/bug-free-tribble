import {
    Router,
} from "express";

import {
    requireAuth,
} from "../../middleware/auth.middleware.ts";

import {
    requireCsrfToken,
} from "../../middleware/csrf.middleware.ts";
import { authRateLimiter } from "../../middleware/rate-limit.middleware.ts";

import {
    create,
    createTicket,
    listConversations,
    unreadCount,
    listMyTickets,
    markRead,
    messages,
    readReceipts,
    send,
} from "./messaging.controller.ts";
import { addCustomerSupportReply, createPublicSupportRequest, getPublicSupportRequest, listMyPublicSupportRequests } from "./support-request.controller.ts";

const router = Router();

// Visitors and members can submit a support request. A random access token
// returned at creation time protects follow-up access for visitors.
router.post("/public-support", authRateLimiter, createPublicSupportRequest);
router.get("/public-support/:requestId", getPublicSupportRequest);
router.post("/public-support/:requestId/messages", addCustomerSupportReply);

/**
 * All messaging routes require authentication.
 */
router.use(
    requireAuth,
);

router.get("/my-public-support", listMyPublicSupportRequests);

/**
 * Buyer–seller conversations.
 */

router.get(
    "/conversations",
    listConversations,
);

router.get("/unread-count", unreadCount);

router.post(
    "/conversations",
    requireCsrfToken,
    create,
);

/**
 * Messages.
 */

router.get(
    "/conversations/:conversationId/messages",
    messages,
);

router.post(
    "/conversations/:conversationId/messages",
    requireCsrfToken,
    send,
);

/**
 * Read receipts.
 */

router.post(
    "/conversations/:conversationId/read",
    requireCsrfToken,
    markRead,
);

router.get(
    "/conversations/:conversationId/read-receipts",
    readReceipts,
);

/**
 * Customer support tickets.
 */

router.post(
    "/support/tickets",
    requireCsrfToken,
    createTicket,
);

router.get(
    "/support/tickets",
    listMyTickets,
);

export default router;
