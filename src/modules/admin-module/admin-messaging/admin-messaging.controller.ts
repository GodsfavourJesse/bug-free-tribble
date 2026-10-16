import type {
    Request,
    Response,
} from "express";

import {
    assignSupportTicket,
} from "./admin-messaging.service.ts";

import {
    revokeUserFromConversationRoom,
} from "../../../realtime/socket.ts";

type AdminAuthenticatedRequest<
    TBody = unknown,
> = Request<
    Record<string, string>,
    unknown,
    TBody
> & {
    admin?: {
        id: string;
    };
};

interface AssignSupportTicketBody {
    assignedToUserId?: unknown;
}

function getRequiredParam(
    value: string | string[] | undefined,
): string | null {
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();

    return trimmed.length > 0
        ? trimmed
        : null;
}

/**
 * PATCH /api/v1/admin/messaging/support/tickets/:ticketId/assignment
 */
export async function assignTicket(
    request: AdminAuthenticatedRequest<AssignSupportTicketBody>,
    response: Response,
): Promise<void> {
    const actorId = request.admin?.id;

    if (!actorId) {
        response.status(401).json({
            success: false,
            message: "Administrator authentication required.",
        });

        return;
    }

    const ticketId = getRequiredParam(
        request.params.ticketId,
    );

    if (!ticketId) {
        response.status(400).json({
            success: false,
            message: "A valid ticket ID is required.",
        });

        return;
    }

    const assignedToUserId =
        request.body?.assignedToUserId;

    if (
        typeof assignedToUserId !== "string" ||
        assignedToUserId.trim().length === 0
    ) {
        response.status(400).json({
            success: false,
            message: "assignedToUserId is required.",
        });

        return;
    }

    try {
        const assignment = await assignSupportTicket(
            ticketId,
            assignedToUserId.trim(),
            actorId,
        );

        /*
         * Revoke the previous agent's room access only after
         * the database transaction has committed.
         */
        if (
            assignment.assignmentChanged &&
            assignment.previousAssigneeId
        ) {
            try {
                await revokeUserFromConversationRoom(
                    ticketId,
                    assignment.previousAssigneeId,
                );
            } catch (realtimeError) {
                console.error(
                    "Failed to revoke the previous support agent's realtime access.",
                    realtimeError,
                );
            }
        }

        response.status(200).json({
            success: true,
            message: assignment.assignmentChanged
                ? "Support ticket assigned successfully."
                : "The support ticket is already assigned to this agent.",
            data: {
                ticket: assignment.ticket,
                assignmentChanged:
                    assignment.assignmentChanged,
            },
        });
    } catch (error) {
        const message =
            error instanceof Error
                ? error.message
                : "Unable to assign support ticket.";

        if (message === "Support ticket not found.") {
            response.status(404).json({
                success: false,
                message,
            });

            return;
        }

        if (
            message.includes("do not have permission") ||
            message.includes(
                "not authorized to handle support tickets",
            )
        ) {
            response.status(403).json({
                success: false,
                message,
            });

            return;
        }

        if (message.includes("cannot be reassigned")) {
            response.status(409).json({
                success: false,
                message,
            });

            return;
        }

        if (
            message.includes("does not exist") ||
            message.includes(
                "Ticket, assignee, and acting user IDs are required",
            )
        ) {
            response.status(400).json({
                success: false,
                message,
            });

            return;
        }

        console.error(
            "Support ticket assignment failed.",
            error,
        );

        response.status(500).json({
            success: false,
            message: "Unable to assign support ticket.",
        });
    }
}