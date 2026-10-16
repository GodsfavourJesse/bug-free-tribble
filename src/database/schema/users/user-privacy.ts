import {
    boolean,
    pgTable,
    timestamp,
    uuid,
} from "drizzle-orm/pg-core";

import { users } from "./users.ts";

export const userPrivacySettings = pgTable(
    "user_privacy_settings",
    {
        userId: uuid("user_id")
            .primaryKey()
            .references(() => users.id, {
                onDelete: "cascade",
            }),

        showPhone: boolean(
            "show_phone",
        )
            .notNull()
            .default(false),

        showEmail: boolean(
            "show_email",
        )
            .notNull()
            .default(false),

        allowDirectMessages: boolean(
            "allow_direct_messages",
        )
            .notNull()
            .default(true),

        showOnlineStatus: boolean(
            "show_online_status",
        )
            .notNull()
            .default(true),

        allowMarketingEmails: boolean(
            "allow_marketing_emails",
        )
            .notNull()
            .default(true),

        allowMarketingSms: boolean(
            "allow_marketing_sms",
        )
            .notNull()
            .default(false),

        updatedAt: timestamp(
            "updated_at",
            {
                withTimezone: true,
            },
        )
            .notNull()
            .defaultNow(),
    },
);