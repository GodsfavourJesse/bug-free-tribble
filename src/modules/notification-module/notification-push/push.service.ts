import { and, eq } from "drizzle-orm";
import { db } from "../../../database/index.ts";
import { pushSubscriptions } from "../../../database/schema/index.ts";

export async function registerPushSubscription(userId: string, input: { endpoint: string; keys: Record<string, unknown>; userAgent?: string; deviceName?: string }) {
  const existing = await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, input.endpoint)).limit(1);
  const values = { userId, endpoint: input.endpoint, keys: input.keys, active: true, ...(input.userAgent !== undefined ? { userAgent: input.userAgent } : {}), ...(input.deviceName !== undefined ? { deviceName: input.deviceName } : {}), updatedAt: new Date() };
  if (existing[0]) {
    const rows = await db.update(pushSubscriptions).set(values).where(eq(pushSubscriptions.id, existing[0].id)).returning();
    return rows[0];
  }
  const rows = await db.insert(pushSubscriptions).values(values).returning();
  return rows[0];
}

export async function unregisterPushSubscription(userId: string, endpoint: string) {
  const rows = await db.update(pushSubscriptions).set({ active: false, updatedAt: new Date() }).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint))).returning({ id: pushSubscriptions.id });
  return rows.length > 0;
}
