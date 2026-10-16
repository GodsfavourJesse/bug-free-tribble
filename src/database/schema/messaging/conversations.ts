import {
    index,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uuid,
} from "drizzle-orm/pg-core";

import { users } from "../users/users.ts";

export const conversationTypeEnum = pgEnum(
    "conversation_type",
    [
        "BUYER_SELLER",
        "SUPPORT",
    ],
);

export const supportTicketStatusEnum = pgEnum(
    "support_ticket_status",
    [
        "OPEN",
        "IN_PROGRESS",
        "RESOLVED",
        "CLOSED",
    ],
);

export const conversations = pgTable(
    "conversations",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        type: conversationTypeEnum("type")
            .notNull()
            .default("BUYER_SELLER"),

        // Support-ticket fields.
        // These remain null for ordinary buyer-seller conversations.
        subject: text("subject"),

        requesterId: uuid("requester_id")
            .references(
                () => users.id,
                {
                    onDelete: "restrict",
                },
            ),

        assignedTo: uuid("assigned_to")
            .references(
                () => users.id,
                {
                    onDelete: "set null",
                },
            ),

        status: supportTicketStatusEnum("status")
            .notNull()
            .default("OPEN"),

        resolvedAt: timestamp(
            "resolved_at",
            {
                withTimezone: true,
            },
        ),

        closedAt: timestamp(
            "closed_at",
            {
                withTimezone: true,
            },
        ),

        createdAt: timestamp(
            "created_at",
            {
                withTimezone: true,
            },
        )
            .notNull()
            .defaultNow(),

        updatedAt: timestamp(
            "updated_at",
            {
                withTimezone: true,
            },
        )
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        typeStatusUpdatedAtIdx: index(
            "conversations_type_status_updated_at_idx",
        ).on(
            table.type,
            table.status,
            table.updatedAt,
        ),

        requesterCreatedAtIdx: index(
            "conversations_requester_created_at_idx",
        ).on(
            table.requesterId,
            table.createdAt,
        ),

        assignedToStatusIdx: index(
            "conversations_assigned_to_status_idx",
        ).on(
            table.assignedTo,
            table.status,
        ),
    }),
);