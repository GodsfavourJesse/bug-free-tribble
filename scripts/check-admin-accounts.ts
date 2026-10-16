import { eq } from "drizzle-orm";

import { closeDatabase, db } from "../src/database/index.ts";

import {
    roles,
    userRoles,
    users,
} from "../src/database/schema/index.ts";

try {
    const results = await db
        .select({
            userId: users.id,
            email: users.email,
            status: users.status,
            emailVerified: users.emailVerified,
            role: roles.name,
        })
        .from(users)
        .innerJoin(
            userRoles,
            eq(userRoles.userId, users.id),
        )
        .innerJoin(
            roles,
            eq(userRoles.roleId, roles.id),
        )
        .where(eq(roles.name, "SUPER_ADMIN"));

    console.log(
        "SUPER_ADMIN accounts:",
        results.map((row) => ({
            userId: row.userId,
            email: row.email,
            status: row.status,
            emailVerified: row.emailVerified,
            role: row.role,
        })),
    );
} catch (error) {
    console.error(
        "Failed to inspect administrator accounts:",
        error,
    );

    process.exitCode = 1;
} finally {
    await closeDatabase();
}