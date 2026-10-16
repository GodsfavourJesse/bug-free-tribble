import {
    index,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { listings } from "./listings.ts";
import { users } from "../users/users.ts";

export const listingHistoryActionEnum =
    pgEnum(
        "listing_history_action",
        [
            "CREATED",
            "UPDATED",
            "SUBMIT_FOR_REVIEW",
            "APPROVED",
            "REJECTED",
            "EXPIRED",
            "MARKED_SOLD",
            "SUSPENDED",
            "RESTORED",
            "REACTIVATED",
            "DELETED",
        ],
    );

export const listingHistory = pgTable(
    "listing_history",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        listingId: uuid("listing_id")
            .notNull()
            .references(
                () => listings.id,
                {
                    onDelete: "cascade",
                },
            ),

        actorId: uuid("actor_id")
            .references(
                () => users.id,
                {
                    onDelete: "set null",
                },
            ),

        action:
            listingHistoryActionEnum(
                "action",
            ).notNull(),

        previousStatus: varchar(
            "previous_status",
            {
                length: 50,
            },
        ),

        newStatus: varchar(
            "new_status",
            {
                length: 50,
            },
        ),

        reason: text("reason"),

        metadata: text("metadata"),

        createdAt: timestamp(
            "created_at",
            {
                withTimezone: true,
            },
        )
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        listingIdx: index(
            "listing_history_listing_idx",
        ).on(
            table.listingId,
            table.createdAt,
        ),

        actorIdx: index(
            "listing_history_actor_idx",
        ).on(
            table.actorId,
            table.createdAt,
        ),

        actionIdx: index(
            "listing_history_action_idx",
        ).on(
            table.action,
            table.createdAt,
        ),
    }),
);