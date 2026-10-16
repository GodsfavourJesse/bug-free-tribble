import {
    boolean,
    jsonb,
    pgEnum,
    pgTable,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { users } from "../users/users.ts";
import { table } from "node:console";

// Every notification is stored so the user can read it later even when offline.
export const notificationTypeEnum = pgEnum(
    "notification_type",
    [
        "GENERAL",
        "LISTING_SUBMITTED",
        "LISTING_APPROVED",
        "LISTING_REJECTED",
        "LISTING_EXPIRED",
        "LISTING_SOLD",
        "SUBSCRIPTION_PAYMENT_PENDING",
        "SUBSCRIPTION_ACTIVATED",
        "SUBSCRIPTION_EXPIRED",
        "BOOST_PAYMENT_PENDING",
        "BOOST_PAYMENT_SUCCESSFUL",
        "BOOST_ACTIVATED",
        "BOOST_EXPIRED",
        "MESSAGE_RECEIVED",
        "DEALER_VERIFIED",
        "DEALER_APPLICATION_REJECTED",
    ],
);

export const notifications = pgTable(
    "notifications",
    {
        id: uuid("id").defaultRandom().primaryKey(),

        // The user who should receive this notification.
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, {
                onDelete: "cascade",
            }),

        type: notificationTypeEnum("type")
            .notNull()
            .default("GENERAL"),

        title: varchar("title", {
            length: 200,
        }).notNull(),

        message: varchar("message", {
            length: 1000,
        }).notNull(),

        // Extra structured information for the frontend, such as listingId/paymentId.
        data: jsonb("data"),

        idempotencyKey: varchar("idempotency_key", {
            length: 255,
        }),

        // Read notifications remain stored for history, but unread count uses this flag.
        read: boolean("read")
            .notNull()
            .default(false),

        readAt: timestamp("read_at", {
            withTimezone: true,
        }),

        createdAt: timestamp("created_at", {
            withTimezone: true,
        })
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        idempotencyKeyUnique: uniqueIndex(
            "notifications_idempotency_key_unique",
        ).on(table.idempotencyKey),
    }),
);

export const notificationPreferences = pgTable(
    "notification_preferences",
    {
        id: uuid("id").defaultRandom().primaryKey(),

        // One preference row belongs to one user.
        userId: uuid("user_id")
            .notNull()
            .unique()
            .references(() => users.id, {
                onDelete: "cascade",
            }),

        inAppEnabled: boolean("in_app_enabled")
            .notNull()
            .default(true),

        emailEnabled: boolean("email_enabled")
            .notNull()
            .default(true),

        createdAt: timestamp("created_at", {
            withTimezone: true,
        })
            .notNull()
            .defaultNow(),

        updatedAt: timestamp("updated_at", {
            withTimezone: true,
        })
            .notNull()
            .defaultNow(),
    },
);
