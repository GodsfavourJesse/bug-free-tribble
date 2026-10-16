import {
    and,
    asc,
    desc,
    eq,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    auditLogs,
    conversations,
    messages,
    users,
} from "../../../database/schema/index.ts";

import { AppError } from "../../../errors/app-error.ts";
import { writeAudit } from "../admin.service.ts";

async function getSupportTicketOrThrow(ticketId: string) {
    const rows = await db.select()
        .from(conversations)
        .where(and(
            eq(conversations.id, ticketId),
            eq(conversations.type, "SUPPORT"),
        ))
        .limit(1);

    const ticket = rows[0];

    if (!ticket) {
        throw new AppError("Support ticket not found.", 404, "SUPPORT_TICKET_NOT_FOUND");
    }

    return ticket;
}

export async function getAdminSupportTicketDetail(ticketId: string) {
    const ticket = await getSupportTicketOrThrow(ticketId);

    const [ticketMessages, requesterRows, assigneeRows, notes] = await Promise.all([
        db.select({
            message: messages,
            sender: {
                id: users.id,
                firstName: users.firstName,
                lastName: users.lastName,
                email: users.email,
                accountType: users.accountType,
            },
        })
            .from(messages)
            .innerJoin(users, eq(users.id, messages.senderId))
            .where(eq(messages.conversationId, ticketId))
            .orderBy(asc(messages.createdAt)),
        ticket.requesterId
            ? db.select({
                id: users.id,
                firstName: users.firstName,
                lastName: users.lastName,
                email: users.email,
            }).from(users).where(eq(users.id, ticket.requesterId)).limit(1)
            : Promise.resolve([]),
        ticket.assignedTo
            ? db.select({
                id: users.id,
                firstName: users.firstName,
                lastName: users.lastName,
                email: users.email,
            }).from(users).where(eq(users.id, ticket.assignedTo)).limit(1)
            : Promise.resolve([]),
        listAdminSupportTicketNotes(ticketId),
    ]);

    return {
        ticket,
        requester: requesterRows[0] ?? null,
        assignee: assigneeRows[0] ?? null,
        messages: ticketMessages,
        internalNotes: notes,
    };
}

export async function listAdminSupportTicketNotes(ticketId: string) {
    await getSupportTicketOrThrow(ticketId);

    const rows = await db.select({
        id: auditLogs.id,
        actorUserId: auditLogs.actorUserId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
    })
        .from(auditLogs)
        .where(and(
            eq(auditLogs.action, "SUPPORT_INTERNAL_NOTE_ADDED"),
            eq(auditLogs.entityType, "SUPPORT_TICKET_NOTE"),
            eq(auditLogs.entityId, ticketId),
        ))
        .orderBy(desc(auditLogs.createdAt));

    return rows.map((row) => {
        const metadata = row.metadata;
        const note = (
            typeof metadata === "object" &&
            metadata !== null &&
            "note" in metadata &&
            typeof metadata.note === "string"
        ) ? metadata.note : "";

        return {
            id: row.id,
            authorId: row.actorUserId,
            note,
            createdAt: row.createdAt,
        };
    });
}

export async function addAdminSupportTicketNote(input: {
    ticketId: string;
    adminId: string;
    note: string;
    ipAddress?: string;
    userAgent?: string;
}) {
    const normalizedNote = input.note.trim();

    if (!normalizedNote || normalizedNote.length > 5000) {
        throw new AppError("Internal note must contain 1–5000 characters.", 400, "INVALID_INTERNAL_NOTE");
    }

    await getSupportTicketOrThrow(input.ticketId);

    return db.transaction(async (tx) => {
        await writeAudit(tx, {
            actorUserId: input.adminId,
            action: "SUPPORT_INTERNAL_NOTE_ADDED",
            entityType: "SUPPORT_TICKET_NOTE",
            entityId: input.ticketId,
            ...(input.ipAddress !== undefined ? { ipAddress: input.ipAddress } : {}),
            ...(input.userAgent !== undefined ? { userAgent: input.userAgent } : {}),
            metadata: {
                note: normalizedNote,
                ticketId: input.ticketId,
            },
        });

        return {
            ticketId: input.ticketId,
            authorId: input.adminId,
            note: normalizedNote,
            createdAt: new Date(),
        };
    });
}
