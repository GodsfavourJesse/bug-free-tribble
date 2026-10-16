import {
    date,
    index,
    pgTable,
    timestamp,
    unique,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { listings } from "./listings.ts";
import { users } from "../users/users.ts";

export const listingViews = pgTable(
    "listing_views",
    {
        id: uuid("id").defaultRandom().primaryKey(),

        listingId: uuid("listing_id")
            .notNull()
            .references(() => listings.id, {
                onDelete: "cascade",
            }),

        viewerId: uuid("viewer_id").references(() => users.id, {
            onDelete: "set null",
        }),

        viewerKey: varchar("viewer_key", {
            length: 128,
        }).notNull(),

        viewedDate: date("viewed_date").notNull(),

        createdAt: timestamp("created_at", {
            withTimezone: true,
        })
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        uniqueViewerDaily: unique(
            "listing_views_daily_unique",
        ).on(
            table.listingId,
            table.viewerKey,
            table.viewedDate,
        ),
        
        listingDateIdx: index(
            "listing_views_listing_date_idx",
        ).on(table.listingId, table.viewedDate),

        viewerIdx: index(
            "listing_views_viewer_idx",
        ).on(table.viewerId, table.createdAt),

        viewerKeyIdx: index(
            "listing_views_viewer_key_idx",
        ).on(table.viewerKey, table.createdAt),
    }),
);