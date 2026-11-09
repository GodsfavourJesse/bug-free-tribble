import { closeDatabase } from "../src/database/index.ts";

import { seedRbac } from "./rbac.seed.ts";
import {
    seedPlatformSettings,
} from "./platform-settings.seed.ts";

try {
    await seedRbac();

    await seedPlatformSettings();

    console.log(
        "Database seed completed successfully.",
    );
} catch (error) {
    console.error(
        "Database seed failed:",
        error,
    );

    process.exitCode = 1;
} finally {
    await closeDatabase();
}