import {
    Router,
} from "express";

import {
    requireAuth,
} from "../../middleware/auth.middleware.ts";

import {
    requireCsrfToken,
} from "../../middleware/csrf.middleware.ts";

import {
    create,
    createTicket,
    listConversations,
    listMyTickets,
    markRead,
    messages,
    readReceipts,
    send,
} from "./messaging.controller.ts";

const router = Router();

/**
 * All messaging routes require authentication.
 */
router.use(
    requireAuth,
);

/**
 * Buyer–seller conversations.
 */

router.get(
    "/conversations",
    listConversations,
);

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