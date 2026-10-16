import { eq } from "drizzle-orm";
import { db } from "../../database/index.ts";
import { platformSettings } from "../../database/schema/index.ts";

export const SETTING_KEYS = {
  dealerDiscountPercent: "dealer_discount_percent",
  freeListingCredits: "free_listing_credits",
  listingDurationDays: "listing_duration_days",
} as const;

const defaults: Record<string, number> = {
  [SETTING_KEYS.dealerDiscountPercent]: 30,
  [SETTING_KEYS.freeListingCredits]: 3,
  [SETTING_KEYS.listingDurationDays]: 30,
};

export async function getNumberSetting(key: string): Promise<number> {
  const row = await db.select().from(platformSettings).where(eq(platformSettings.key, key)).limit(1);
  if (!row[0]) return defaults[key] ?? 0;
  const value = Number(row[0].value);
  return Number.isFinite(value) ? value : (defaults[key] ?? 0);
}

export async function setNumberSetting(key: string, value: number, updatedBy: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error("Setting value must be a non-negative number.");
  const existing = await db.select({ id: platformSettings.id }).from(platformSettings).where(eq(platformSettings.key, key)).limit(1);
  if (existing[0]) {
    const rows = await db.update(platformSettings).set({ value, updatedBy, updatedAt: new Date() }).where(eq(platformSettings.id, existing[0].id)).returning();
    return rows[0];
  }
  const rows = await db.insert(platformSettings).values({ key, value, updatedBy }).returning();
  return rows[0];
}

export async function getCommercialSettings() {
  const entries = await Promise.all(Object.values(SETTING_KEYS).map(async (key) => [key, await getNumberSetting(key)] as const));
  return Object.fromEntries(entries);
}
