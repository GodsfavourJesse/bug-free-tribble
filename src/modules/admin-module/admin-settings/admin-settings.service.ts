import { eq } from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    platformSettings,
} from "../../../database/schema/index.ts";

import {
    SETTING_KEYS,
    DEFAULT_SETTINGS,
    getCommercialSettings,
    getAllSettingValues,
} from "../../platform-settings/platform-settings.service.ts";

import {
    writeAudit,
} from "../admin.service.ts";

import type {
    UpdateCommercialSettingsInput,
} from "./admin-settings.validation.ts";
import { 
    SETTING_DEFINITIONS, 
    SettingKey } from "../../platform-settings/platform-settings.registry.ts";

export async function getAdminCommercialSettings() {
    return getCommercialSettings();
}

export async function updateAdminCommercialSettings(
    actorUserId: string,
    input: UpdateCommercialSettingsInput,
) {
    await db.transaction(async (tx) => {
        const settingsToUpdate = [
            {
                key: SETTING_KEYS.dealerDiscountPercent,
                value: input.dealerDiscountPercent,
            },
            {
                key: SETTING_KEYS.freeListingCredits,
                value: input.freeListingCredits,
            },
            {
                key: SETTING_KEYS.listingDurationDays,
                value: input.listingDurationDays,
            },
        ] as const;

        const previousValues: Record<string, number> = {};
        const newValues: Record<string, number> = {};

        for (const setting of settingsToUpdate) {
            if (setting.value === undefined) {
                continue;
            }

            const existingRows = await tx
                .select({
                    value: platformSettings.value,
                })
                .from(platformSettings)
                .where(
                    eq(
                        platformSettings.key,
                        setting.key,
                    ),
                )
                .limit(1);

            const existing = existingRows[0];

            const storedValue = existing
                ? Number(existing.value)
                : Number.NaN;

            previousValues[setting.key] =
                Number.isFinite(storedValue)
                    ? storedValue
                    : DEFAULT_SETTINGS[setting.key];

            newValues[setting.key] = setting.value;

            await tx
                .insert(platformSettings)
                .values({
                    key: setting.key,
                    value: setting.value,
                    updatedBy: actorUserId,
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: platformSettings.key,
                    set: {
                        value: setting.value,
                        updatedBy: actorUserId,
                        updatedAt: new Date(),
                    },
                });
        }

        await writeAudit(tx, {
            actorUserId,
            action: "COMMERCIAL_SETTINGS_UPDATED",
            entityType: "platform_settings",
            metadata: {
                previousValues,
                newValues,
            },
        });
    });

    return getCommercialSettings();
}

export async function getAdminSettingsOverview() {
    const values = await getAllSettingValues();

    return Object.values(SETTING_DEFINITIONS).map(
        (definition) => ({
            ...definition,
            currentValue: values[definition.key as SettingKey],
        }),
    );
}

export async function getAdminSettingsByCategory(
    category: string,
) {
    const settings = await getAdminSettingsOverview();

    return settings.filter(
        (setting) => setting.category === category,
    );
}