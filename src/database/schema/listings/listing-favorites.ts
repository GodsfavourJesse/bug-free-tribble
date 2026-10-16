import {
    index,
    pgTable,
    timestamp,
    unique,
    uuid,
} from "drizzle-orm/pg-core";

import { listings } from "./listings.ts";
import { users } from "../users/users.ts";

export const listingFavorites = pgTable(
    "listing_favorites",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, {
                onDelete: "cascade",
            }),

        listingId: uuid("listing_id")
            .notNull()
            .references(() => listings.id, {
                onDelete: "cascade",
            }),

        createdAt: timestamp("created_at", {
            withTimezone: true,
        })
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        userListingUnique: unique(
            "listing_favorites_user_listing_unique",
        ).on(
            table.userId,
            table.listingId,
        ),

        userCreatedIdx: index(
            "listing_favorites_user_created_idx",
        ).on(
            table.userId,
            table.createdAt,
        ),

        listingIdx: index(
            "listing_favorites_listing_idx",
        ).on(table.listingId),
    }),
);