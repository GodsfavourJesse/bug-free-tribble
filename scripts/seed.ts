import { closeDatabase } from "../src/database/index.ts";
import { seedRbac } from "./rbac.seed.ts";

try {
    await seedRbac();

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