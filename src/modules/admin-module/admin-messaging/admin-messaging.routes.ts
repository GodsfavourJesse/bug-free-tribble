import { Router } from "express";

import { requireAdminAuth } from "../../../middleware/admin-middleware/admin-auth.middleware.ts";
import { requirePermission } from "../../../middleware/admin-middleware/admin.middleware.ts";

import { assignTicket } from "./admin-messaging.controller.ts";
import { listAdminSupportTickets } from "./admin-support-ticket.controller.ts";

import {
    addAdminSupportTicketNoteController,
    getAdminSupportTicketController,
    listAdminSupportTicketNotesController,
} from "./admin-support-detail.controller.ts";

const router = Router();

router.use(requireAdminAuth);

router.get(
    "/support/tickets",
    requirePermission("support:ticket:view_all"),
    listAdminSupportTickets,
);

router.get(
    "/support/tickets/:ticketId",
    requirePermission("support:ticket:view_all"),
    getAdminSupportTicketController,
);

router.get(
    "/support/tickets/:ticketId/notes",
    requirePermission("support:ticket:notes"),
    listAdminSupportTicketNotesController,
);

router.post(
    "/support/tickets/:ticketId/notes",
    requirePermission("support:ticket:notes"),
    addAdminSupportTicketNoteController,
);

router.patch(
    "/support/tickets/:ticketId/assignment",
    requirePermission("support:ticket:assign"),
    assignTicket,
);

export default router;
