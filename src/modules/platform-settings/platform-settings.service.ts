import { eq } from "drizzle-orm";

import { db } from "../../database/index.ts";

import { platformSettings } from "../../database/schema/index.ts";

import {
    DEFAULT_SETTINGS,
    SETTING_KEYS,
    isSettingKey,
    type SettingKey,
} from "./platform-settings.registry.ts";

export {
    DEFAULT_SETTINGS,
    SETTING_KEYS,
} from "./platform-settings.registry.ts";

export type { SettingKey } from "./platform-settings.registry.ts";

/*
 * ============================================================
 * SINGLE SETTING
 * ============================================================
 */

export async function getNumberSetting(key: SettingKey): Promise<number> {
    const rows = await db
        .select({
            value: platformSettings.value,
        })
        .from(platformSettings)
        .where(eq(platformSettings.key, key))
        .limit(1);

    const row = rows[0];

    if (!row) {
        return DEFAULT_SETTINGS[key];
    }

    const value = Number(row.value);

    if (!Number.isFinite(value)) {
        return DEFAULT_SETTINGS[key];
    }

    return value;
}

/*
 * ============================================================
 * COMMERCIAL SETTINGS
 * ============================================================
 */

export async function getCommercialSettings() {
    const [dealerDiscountPercent, freeListingCredits, listingDurationDays] =
        await Promise.all([
            getNumberSetting(SETTING_KEYS.dealerDiscountPercent),

            getNumberSetting(SETTING_KEYS.freeListingCredits),

            getNumberSetting(SETTING_KEYS.listingDurationDays),
        ]);

    return {
        dealerDiscountPercent,
        freeListingCredits,
        listingDurationDays,
    };
}

/*
 * ============================================================
 * ALL SETTINGS
 * ============================================================
 */

export async function getAllSettingValues(): Promise<
    Record<SettingKey, number>
> {
    const rows = await db
        .select({
            key: platformSettings.key,
            value: platformSettings.value,
        })
        .from(platformSettings);

    const values: Record<SettingKey, number> = {
        ...DEFAULT_SETTINGS,
    };

    for (const row of rows) {
        if (!isSettingKey(row.key)) {
            continue;
        }

        const value = Number(row.value);

        if (Number.isFinite(value)) {
            values[row.key] = value;
        }
    }

    return values;
}