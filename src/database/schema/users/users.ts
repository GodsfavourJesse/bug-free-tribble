import {
    boolean,
    jsonb,
    pgEnum,
    pgTable,
    timestamp,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

export const accountTypeEnum = pgEnum("account_type", [
    "USER",
    "DEALER",
]);

export const userStatusEnum = pgEnum("user_status", [
    "ACTIVE",
    "SUSPENDED",
    "DELETED",
]);

export const users = pgTable("users", {
    id: uuid("id")
        .defaultRandom()
        .primaryKey(),

    email: varchar("email", {
        length: 255,
    })
        .notNull()
        .unique(),

    passwordHash: varchar("password_hash", {
        length: 255,
    })
        .notNull(),

    firstName: varchar("first_name", {
        length: 100,
    })
        .notNull(),

    lastName: varchar("last_name", {
        length: 100,
    })
        .notNull(),

    phone: varchar("phone", {
        length: 30,
    }),

    avatarUrl: varchar("avatar_url", {
        length: 500,
    }),

    profileMetadata: jsonb(
        "profile_metadata",
    )
        .$type<Record<string, unknown>>()
        .notNull()
        .default({}),

    accountType: accountTypeEnum(
        "account_type",
    )
        .notNull()
        .default("USER"),

    status: userStatusEnum(
        "status",
    )
        .notNull()
        .default("ACTIVE"),

    emailVerified: boolean(
        "email_verified",
    )
        .notNull()
        .default(false),

    deletionRequestedAt: timestamp(
        "deletion_requested_at",
        {
            withTimezone: true,
        },
    ),

    deletedAt: timestamp(
        "deleted_at",
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
});