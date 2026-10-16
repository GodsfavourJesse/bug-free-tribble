import type {
    NextFunction,
    Request,
    Response,
} from "express";

import { z } from "zod";

import {
    addAdminSupportTicketNote,
    getAdminSupportTicketDetail,
    listAdminSupportTicketNotes,
} from "./admin-support-detail.service.ts";

const ticketIdSchema = z.string().uuid();

const noteSchema = z.object({
    note: z.string().trim().min(1).max(5000),
});

function requireAdminId(request: Request): string | undefined {
    return request.admin?.id;
}

function requireTicketId(request: Request): string | null {
    const value = request.params.ticketId;
    return typeof value === "string" && ticketIdSchema.safeParse(value).success
        ? value
        : null;
}

export async function getAdminSupportTicketController(
    request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const ticketId = requireTicketId(request);
        if (!ticketId) {
            response.status(400).json({
                success: false,
                message: "A valid ticket ID is required.",
            });
            return;
        }

        const data = await getAdminSupportTicketDetail(ticketId);

        response.status(200).json({
            success: true,
            data,
        });
    } catch (error) {
        next(error);
    }
}

export async function listAdminSupportTicketNotesController(
    request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const ticketId = requireTicketId(request);
        if (!ticketId) {
            response.status(400).json({
                success: false,
                message: "A valid ticket ID is required.",
            });
            return;
        }

        const data = await listAdminSupportTicketNotes(ticketId);

        response.status(200).json({
            success: true,
            data,
        });
    } catch (error) {
        next(error);
    }
}

export async function addAdminSupportTicketNoteController(
    request: Request,
    response: Response,
    next: NextFunction,
): Promise<void> {
    try {
        const adminId = requireAdminId(request);
        if (!adminId) {
            response.status(401).json({
                success: false,
                message: "Administrator authentication required.",
            });
            return;
        }

        const ticketId = requireTicketId(request);
        if (!ticketId) {
            response.status(400).json({
                success: false,
                message: "A valid ticket ID is required.",
            });
            return;
        }

        const body = noteSchema.parse(request.body);
        const userAgent = request.get("user-agent");

        const data = await addAdminSupportTicketNote({
            ticketId,
            adminId,
            note: body.note,
            ...(request.ip !== undefined ? { ipAddress: request.ip } : {}),
            ...(userAgent !== undefined ? { userAgent } : {}),
        });

        response.status(201).json({
            success: true,
            message: "Internal note added.",
            data,
        });
    } catch (error) {
        next(error);
    }
}
