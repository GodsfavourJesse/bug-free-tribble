import {
    index,
    pgTable,
    text,
    timestamp,
    uuid,
} from "drizzle-orm/pg-core";

import {
    conversations,
} from "./conversations.ts";

import {
    users,
} from "../users/users.ts";

export const messages = pgTable(
    "messages",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        conversationId: uuid("conversation_id")
            .notNull()
            .references(
                () => conversations.id,
                {
                    onDelete: "cascade",
                },
            ),

        senderId: uuid("sender_id")
            .notNull()
            .references(
                () => users.id,
                {
                    onDelete: "cascade",
                },
            ),

        body: text("body")
            .notNull(),

        createdAt: timestamp(
            "created_at",
            {
                withTimezone: true,
            },
        )
            .notNull()
            .defaultNow(),

        /**
         * Legacy single-timestamp read field.
         *
         * This does not track read receipts independently
         * for each conversation participant.
         */
        readAt: timestamp(
            "read_at",
            {
                withTimezone: true,
            },
        ),
    },
    (table) => ({
        /**
         * Supports retrieving messages in conversation
         * chronological order.
         */
        conversationCreatedAtIdx: index(
            "messages_conversation_created_at_idx",
        ).on(
            table.conversationId,
            table.createdAt,
        ),

        /**
         * Supports queries that filter messages by sender.
         */
        senderIdIdx: index(
            "messages_sender_id_idx",
        ).on(
            table.senderId,
        ),
    }),
);