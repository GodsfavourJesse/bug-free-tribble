import { closeDatabase } from "../src/database/index.ts";
import { seedRbac } from "./rbac.seed.ts";
import { seedSuperAdmin } from "./super-admin.seed.ts";

try {
    // Ensure the canonical roles and complete permission matrix exist first.
    await seedRbac();

    const result = await seedSuperAdmin();

    console.log(
        result.created
            ? "Initial SUPER_ADMIN bootstrap completed successfully."
            : "SUPER_ADMIN bootstrap check completed; no changes were necessary.",
    );
} catch (error: unknown) {
    console.error(
        "SUPER_ADMIN bootstrap failed:",
        error instanceof Error ? error.message : "Unknown error.",
    );

    process.exitCode = 1;
} finally {
    await closeDatabase();
}
