import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "../users/users.ts";

export type SupportRequestMessage = {
    author: "customer" | "support";
    body: string;
    createdAt: string;
};

export const supportRequests = pgTable("support_requests", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    subject: text("subject").notNull(),
    accessTokenHash: text("access_token_hash").notNull().unique(),
    status: text("status").notNull().default("OPEN"),
    messages: jsonb("messages").$type<SupportRequestMessage[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    statusUpdatedAtIdx: index("support_requests_status_updated_at_idx").on(table.status, table.updatedAt),
    userCreatedAtIdx: index("support_requests_user_created_at_idx").on(table.userId, table.createdAt),
}));
