import {
    boolean,
    pgTable,
    text,
    timestamp,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { users } from "../users/users.ts";

/* ============================================================
   DEALER PROFILES
============================================================ */

export const dealerProfiles = pgTable(
    "dealer_profiles",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        userId: uuid("user_id")
            .notNull()
            .unique()
            .references(
                () => users.id,
                {
                    onDelete: "cascade",
                },
            ),

        companyName: varchar(
            "company_name",
            {
                length: 200,
            },
        ).notNull(),

        verified: boolean(
            "verified",
        )
            .notNull()
            .default(false),

        verifiedAt: timestamp(
            "verified_at",
            {
                withTimezone: true,
            },
        ),

        bio: text("bio"),

        profilePictureUrl: varchar("profile_picture_url", {
            length: 2048,
        }),

        profilePicturePublicId: varchar("profile_picture_public_id", {
            length: 255,
        }),

        coverPhotoUrl: varchar("cover_photo_url", {
            length: 2048,
        }),

        coverPhotoPublicId: varchar("cover_photo_public_id", {
            length: 255,
        }),

        createdAt: timestamp(
            "created_at",
            {
                withTimezone: true,
            },
        )
            .notNull()
            .defaultNow(),
    },
);