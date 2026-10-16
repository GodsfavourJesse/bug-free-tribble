import {
    eq,
} from "drizzle-orm";

import {
    db,
} from "../../../database/index.ts";

import {
    userPrivacySettings,
} from "../../../database/schema/index.ts";

import {
    AppError,
} from "../../../errors/app-error.ts";

export async function ensurePrivacySettings(
    userId: string,
) {
    const existing = await db
        .select()
        .from(userPrivacySettings)
        .where(
            eq(
                userPrivacySettings.userId,
                userId,
            ),
        )
        .limit(1);

    if (existing[0]) {
        return existing[0];
    }

    const inserted = await db
        .insert(userPrivacySettings)
        .values({
            userId,
        })
        .onConflictDoNothing()
        .returning();

    if (inserted[0]) {
        return inserted[0];
    }

    // Another request may have initialized the settings
    // between our initial read and the insert.
    const retry = await db
        .select()
        .from(userPrivacySettings)
        .where(
            eq(
                userPrivacySettings.userId,
                userId,
            ),
        )
        .limit(1);

    if (!retry[0]) {
        throw new AppError(
            "Unable to initialize privacy settings.",
            500,
            "PRIVACY_SETTINGS_INIT_FAILED",
        );
    }

    return retry[0];
}