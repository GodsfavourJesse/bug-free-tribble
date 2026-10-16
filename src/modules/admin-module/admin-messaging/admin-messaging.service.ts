import { and, count, desc, eq, inArray } from "drizzle-orm";

import type { SQL } from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    conversationParticipants,
    conversations,
    users,
} from "../../../database/schema/index.ts";

import { userHasPermission } from "../../rbac/rbac.service.ts";

/**
 * Supported support-ticket statuses.
 */
export type AdminSupportTicketStatus =
    | "OPEN"
    | "IN_PROGRESS"
    | "RESOLVED"
    | "CLOSED";

/**
 * Result returned after assigning a support ticket.
 */
export interface AssignSupportTicketResult {
    ticket: typeof conversations.$inferSelect;
    previousAssigneeId: string | null;
    assignmentChanged: boolean;
}

/**
 * Options for retrieving support tickets in the admin inbox.
 */
export interface AdminSupportTicketListOptions {
    page: number;
    limit: number;
    status?: AdminSupportTicketStatus;
}

/**
 * Maximum number of tickets returned per page.
 */
const MAX_ADMIN_TICKET_PAGE_SIZE = 100;

/**
 * Validates that an ID is a non-empty string.
 */
function requireNonEmptyId(value: string, fieldName: string): void {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`${fieldName} is required.`);
    }
}

/**
 * Assigns a support ticket to an authorized support agent.
 *
 * Authorization requirements:
 * - The acting user must have support:ticket:assign.
 * - The target user must have support:ticket:view.
 *
 * Assignment behavior:
 * - The requester remains a participant.
 * - The previous assignee is removed from the participant list.
 * - The new assignee is added as a participant.
 * - OPEN tickets become IN_PROGRESS.
 * - RESOLVED and CLOSED tickets cannot be reassigned.
 *
 * The previous assignee ID is returned so the controller can
 * revoke their Socket.IO room access after the transaction commits.
 */
export async function assignSupportTicket(
    ticketId: string,
    assignedToUserId: string,
    actorId: string,
): Promise<AssignSupportTicketResult> {
    requireNonEmptyId(ticketId, "Ticket ID");

    requireNonEmptyId(assignedToUserId, "Assignee user ID");

    requireNonEmptyId(actorId, "Acting user ID");

    /*
     * Verify that the acting user can assign support tickets.
     */
    const actorCanAssign = await userHasPermission(
        actorId,
        "support:ticket:assign",
    );

    if (!actorCanAssign) {
        throw new Error(
            "You do not have permission to assign support tickets.",
        );
    }

    /*
     * Verify that the target user is authorized to handle
     * support tickets.
     */
    const targetCanHandleTickets = await userHasPermission(
        assignedToUserId,
        "support:ticket:view",
    );

    if (!targetCanHandleTickets) {
        throw new Error(
            "The selected user is not authorized to handle support tickets.",
        );
    }

    /*
     * Confirm that the target user exists.
     */
    const targetUsers = await db
        .select({
            id: users.id,
        })
        .from(users)
        .where(eq(users.id, assignedToUserId))
        .limit(1);

    if (!targetUsers[0]) {
        throw new Error("The selected support agent does not exist.");
    }

    /*
     * Perform assignment changes inside a transaction.
     *
     * The ticket row is locked to prevent concurrent assignment
     * operations from overwriting one another.
     */
    return db.transaction(async (tx) => {
        const ticketRows = await tx
            .select()
            .from(conversations)
            .where(
                and(
                    eq(conversations.id, ticketId),
                    eq(conversations.type, "SUPPORT"),
                ),
            )
            .for("update")
            .limit(1);

        const ticket = ticketRows[0];

        if (!ticket) {
            throw new Error("Support ticket not found.");
        }

        /*
         * Resolved and closed tickets cannot be reassigned.
         */
        if (ticket.status === "CLOSED" || ticket.status === "RESOLVED") {
            throw new Error(
                "Resolved or closed tickets cannot be reassigned.",
            );
        }

        /*
         * If the requested assignee is already assigned,
         * return the existing ticket without modifying anything.
         */
        if (ticket.assignedTo === assignedToUserId) {
            return {
                ticket,
                previousAssigneeId: null,
                assignmentChanged: false,
            };
        }

        const previousAssigneeId = ticket.assignedTo;

        /*
         * Remove the previous assignee from the participant list.
         *
         * Never remove the requester as part of reassignment.
         */
        if (previousAssigneeId && previousAssigneeId !== ticket.requesterId) {
            await tx
                .delete(conversationParticipants)
                .where(
                    and(
                        eq(conversationParticipants.conversationId, ticketId),
                        eq(conversationParticipants.userId, previousAssigneeId),
                    ),
                );
        }

        /*
         * Add the new assignee as a participant.
         *
         * The database should enforce uniqueness for the
         * conversationId/userId participant pair.
         */
        await tx
            .insert(conversationParticipants)
            .values({
                conversationId: ticketId,
                userId: assignedToUserId,
            })
            .onConflictDoNothing();

        /*
         * Update the ticket assignment and status.
         *
         * OPEN tickets become IN_PROGRESS.
         * Existing IN_PROGRESS tickets remain IN_PROGRESS.
         */
        const updatedRows = await tx
            .update(conversations)
            .set({
                assignedTo: assignedToUserId,
                status: ticket.status === "OPEN" ? "IN_PROGRESS" : ticket.status,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(conversations.id, ticketId),
                    eq(conversations.type, "SUPPORT"),
                ),
            )
            .returning();

        const updatedTicket = updatedRows[0];

        if (!updatedTicket) {
            throw new Error("Unable to assign the support ticket.");
        }

        /*
         * Return the previous assignee so the controller can
         * revoke their realtime room access after this transaction
         * successfully commits.
         */
        return {
            ticket: updatedTicket,
            previousAssigneeId,
            assignmentChanged: true,
        };
    });
}

/**
 * Retrieves support tickets for the administrator inbox.
 *
 * Only SUPPORT conversations are returned.
 *
 * Requester and assignee profiles are fetched in a single
 * additional query rather than one query per ticket.
 */
export async function getAdminSupportTickets(
    options: AdminSupportTicketListOptions,
) {
    const { page, limit, status } = options;

    /*
     * Validate pagination.
     */
    if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > MAX_ADMIN_TICKET_PAGE_SIZE
    ) {
        throw new Error("Invalid support ticket pagination options.");
    }

    /*
     * Validate the optional status filter.
     */
    if (
        status !== undefined &&
        !["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].includes(status)
    ) {
        throw new Error("Invalid support ticket status.");
    }

    const offset = (page - 1) * limit;

    if (!Number.isSafeInteger(offset)) {
        throw new Error("Support ticket pagination offset is too large.");
    }

    /*
     * Explicit SQL typing avoids narrow array inference issues
     * when adding different conditions to the same array.
     */
    const conditions: SQL[] = [eq(conversations.type, "SUPPORT")];

    if (status !== undefined) {
        conditions.push(eq(conversations.status, status));
    }

    const whereCondition = and(...conditions);

    /*
     * Fetch the requested page and total count concurrently.
     */
    const [ticketRows, totalRows] = await Promise.all([
        db
            .select()
            .from(conversations)
            .where(whereCondition)
            .orderBy(desc(conversations.updatedAt), desc(conversations.createdAt))
            .limit(limit)
            .offset(offset),

        db
            .select({
                total: count(),
            })
            .from(conversations)
            .where(whereCondition),
    ]);

    const total = Number(totalRows[0]?.total ?? 0);

    const totalPages = Math.ceil(total / limit);

    /*
     * Collect requester and assignee IDs.
     *
     * Remove null values and duplicates before querying users.
     */
    const userIds = [
        ...new Set(
            ticketRows
                .flatMap((ticket) => [ticket.requesterId, ticket.assignedTo])
                .filter((userId): userId is string => userId !== null),
        ),
    ];

    /*
     * Retrieve all relevant user profiles in one query.
     */
    const profileRows =
        userIds.length > 0
            ? await db
                  .select({
                      id: users.id,
                      firstName: users.firstName,
                      lastName: users.lastName,
                      avatarUrl: users.avatarUrl,
                      accountType: users.accountType,
                  })
                  .from(users)
                  .where(inArray(users.id, userIds))
            : [];

    /*
     * Index profiles by user ID for efficient mapping.
     */
    const profilesById = new Map(
        profileRows.map((profile) => [profile.id, profile]),
    );

    /*
     * Attach requester and assignee profiles to each ticket.
     *
     * Missing profiles are represented as null.
     */
    const tickets = ticketRows.map((ticket) => ({
        ...ticket,

        requester: ticket.requesterId
            ? (profilesById.get(ticket.requesterId) ?? null)
            : null,

        assignee: ticket.assignedTo
            ? (profilesById.get(ticket.assignedTo) ?? null)
            : null,
    }));

    return {
        tickets,

        pagination: {
            page,
            limit,
            total,
            totalPages,

            hasNextPage: page < totalPages,

            hasPreviousPage: page > 1 && page <= totalPages,
        },
    };
}