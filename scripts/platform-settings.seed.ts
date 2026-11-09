import { eq } from "drizzle-orm";
import { SETTING_DEFINITIONS } from "../src/modules/platform-settings/platform-settings.registry.ts";
import { db } from "../src/database/index.ts";
import { platformSettings } from "../src/database/schema/settings.ts";

export async function seedPlatformSettings(): Promise<void> {
    const definitions = Object.values(SETTING_DEFINITIONS);

    await db.transaction(async (tx) => {
        for (const setting of definitions) {
            await tx
                .insert(platformSettings)
                .values({
                    key: setting.key,
                    value: setting.defaultValue,
                    description: setting.description,
                })
                .onConflictDoNothing({
                    target: platformSettings.key,
                });
        }
    });

    console.log(
        `Platform settings initialized (${definitions.length} settings).`,
    );
}