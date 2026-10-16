import { eq } from "drizzle-orm";

import { db } from "../../database/index.ts";

import {
    platformSettings,
} from "../../database/schema/index.ts";

export async function getNumberSetting(
    key: string,
): Promise<number> {
    const result =
        await db
            .select({
                value:
                    platformSettings.value,
            })
            .from(
                platformSettings,
            )
            .where(
                eq(
                    platformSettings.key,
                    key,
                ),
            )
            .limit(1);

    const setting =
        result[0];

    if (!setting) {
        return 0;
    }

    const value =
        setting.value;

    if (
        typeof value ===
            "number" &&
        Number.isFinite(value)
    ) {
        return value;
    }

    if (
        typeof value ===
            "object" &&
        value !== null &&
        "value" in value &&
        typeof value.value ===
            "number" &&
        Number.isFinite(
            value.value,
        )
    ) {
        return value.value;
    }

    return 0;
}