import {
    index,
    pgTable,
    primaryKey,
    timestamp,
    uuid,
} from "drizzle-orm/pg-core";

import {
    conversations,
} from "./conversations.ts";

import {
    users,
} from "../users/users.ts";

export const conversationParticipants = pgTable(
    "conversation_participants",
    {
        conversationId: uuid("conversation_id")
            .notNull()
            .references(
                () => conversations.id,
                {
                    onDelete: "cascade",
                },
            ),

        userId: uuid("user_id")
            .notNull()
            .references(
                () => users.id,
                {
                    onDelete: "cascade",
                },
            ),

        joinedAt: timestamp(
            "joined_at",
            {
                withTimezone: true,
            },
        )
            .notNull()
            .defaultNow(),

        /**
         * Timestamp of the most recent point up to
         * which this participant has read the conversation.
         *
         * Null means no read position has been recorded.
         */
        lastReadAt: timestamp(
            "last_read_at",
            {
                withTimezone: true,
            },
        ),
    },
    (table) => ({
        pk: primaryKey({
            columns: [
                table.conversationId,
                table.userId,
            ],
        }),

        /**
         * Supports finding conversations belonging to a user.
         *
         * The primary key already indexes the combination
         * of conversationId and userId, so we do not add
         * another index on that same combination.
         */
        userIdIdx: index(
            "conversation_participants_user_id_idx",
        ).on(
            table.userId,
        ),
    }),
);