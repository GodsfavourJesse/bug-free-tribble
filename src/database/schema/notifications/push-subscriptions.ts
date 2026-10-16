import { boolean, jsonb, pgTable, timestamp, uuid, varchar, index } from "drizzle-orm/pg-core";
import { users } from "../users/users.ts";

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: varchar("endpoint", { length: 2000 }).notNull().unique(),
  keys: jsonb("keys").notNull(),
  userAgent: varchar("user_agent", { length: 500 }),
  deviceName: varchar("device_name", { length: 120 }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index("push_subscriptions_user_idx").on(table.userId, table.active),
}));
