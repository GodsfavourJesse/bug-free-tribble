import {
    index,
    pgEnum,
    pgTable,
    timestamp,
    uuid,
} from "drizzle-orm/pg-core";

import { listings } from "./listings.ts";
import { users } from "../users/users.ts";

export const listingSharePlatformEnum = pgEnum(
    "listing_share_platform",
    [
        "WHATSAPP",
        "FACEBOOK",
        "X",
        "COPY_LINK",
        "OTHER",
    ],
);

export const listingShares = pgTable(
    "listing_shares",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        listingId: uuid("listing_id")
            .notNull()
            .references(() => listings.id, {
                onDelete: "cascade",
            }),

        userId: uuid("user_id").references(
            () => users.id,
            {
                onDelete: "set null",
            },
        ),

        platform: listingSharePlatformEnum(
            "platform",
        ).notNull(),

        createdAt: timestamp("created_at", {
            withTimezone: true,
        })
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        listingCreatedIdx: index(
            "listing_shares_listing_created_idx",
        ).on(
            table.listingId,
            table.createdAt,
        ),

        userCreatedIdx: index(
            "listing_shares_user_created_idx",
        ).on(
            table.userId,
            table.createdAt,
        ),

        platformCreatedIdx: index(
            "listing_shares_platform_created_idx",
        ).on(
            table.platform,
            table.createdAt,
        ),
    }),
);