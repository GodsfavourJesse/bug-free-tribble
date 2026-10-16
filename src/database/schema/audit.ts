import { jsonb, pgTable, text, timestamp, uuid, varchar, index } from "drizzle-orm/pg-core";
import { users } from "./users/users.ts";

export const auditLogs = pgTable("audit_logs", {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 120 }).notNull(),
    entityType: varchar("entity_type", { length: 80 }).notNull(),
    entityId: varchar("entity_id", { length: 120 }),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 500 }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    actorIdx: index("audit_logs_actor_idx").on(table.actorUserId, table.createdAt),
    entityIdx: index("audit_logs_entity_idx").on(table.entityType, table.entityId, table.createdAt),
}));
