import argon2 from "argon2";
import { and, eq, sql } from "drizzle-orm";

import { env } from "../src/config/env.ts";
import { db } from "../src/database/index.ts";
import {
    roles,
    userRoles,
    users,
} from "../src/database/schema/index.ts";
import { writeAudit } from "../src/modules/admin-module/admin.service.ts";

function readBootstrapConfiguration() {
    const raw = {
        email: env.BOOTSTRAP_SUPER_ADMIN_EMAIL,
        password: env.BOOTSTRAP_SUPER_ADMIN_PASSWORD,
        firstName: env.BOOTSTRAP_SUPER_ADMIN_FIRST_NAME,
        lastName: env.BOOTSTRAP_SUPER_ADMIN_LAST_NAME,
    };

    const missing: string[] = [];
    if (!raw.email) missing.push("BOOTSTRAP_SUPER_ADMIN_EMAIL");
    if (!raw.password) missing.push("BOOTSTRAP_SUPER_ADMIN_PASSWORD");
    if (!raw.firstName) missing.push("BOOTSTRAP_SUPER_ADMIN_FIRST_NAME");
    if (!raw.lastName) missing.push("BOOTSTRAP_SUPER_ADMIN_LAST_NAME");

    if (missing.length > 0) {
        throw new Error(
            `Missing required bootstrap environment variables: ${missing.join(", ")}.`,
        );
    }

    // Narrow the optional env properties after the explicit missing-value check.
    return {
        email: raw.email!.trim().toLowerCase(),
        password: raw.password!,
        firstName: raw.firstName!.trim(),
        lastName: raw.lastName!.trim(),
    };
}

/**
 * Creates the initial SUPER_ADMIN account exactly once.
 *
 * Security rules:
 * - Credentials are read from environment variables, never source code.
 * - Existing accounts are never silently promoted or have their password changed.
 * - Re-running the seed for an already-active, verified SUPER_ADMIN is safe.
 * - Account creation, role assignment, and audit record are one transaction.
 */
export async function seedSuperAdmin(): Promise<{
    email: string;
    created: boolean;
}> {
    const config = readBootstrapConfiguration();

    const passwordHash = await argon2.hash(config.password, {
        type: argon2.argon2id,
    });

    return db.transaction(async (tx) => {
        // Serialize concurrent runs targeting the same email address.
        await tx.execute(sql`
            SELECT pg_advisory_xact_lock(
                hashtext(${`karmass:bootstrap-super-admin:${config.email}`})
            )
        `);

        const superAdminRoleRows = await tx
            .select({ id: roles.id })
            .from(roles)
            .where(eq(roles.name, "SUPER_ADMIN"))
            .limit(1);

        const superAdminRole = superAdminRoleRows[0];

        if (!superAdminRole) {
            throw new Error(
                'The SUPER_ADMIN role does not exist. Run the RBAC seed before bootstrapping the administrator.',
            );
        }

        const existingUserRows = await tx
            .select({
                id: users.id,
                email: users.email,
                status: users.status,
                emailVerified: users.emailVerified,
            })
            .from(users)
            .where(eq(users.email, config.email))
            .limit(1);

        const existingUser = existingUserRows[0];

        if (existingUser) {
            const assignmentRows = await tx
                .select({ userId: userRoles.userId })
                .from(userRoles)
                .where(
                    and(
                        eq(userRoles.userId, existingUser.id),
                        eq(userRoles.roleId, superAdminRole.id),
                    ),
                )
                .limit(1);

            if (assignmentRows.length === 0) {
                throw new Error(
                    `An account already exists for ${config.email}, but it is not assigned SUPER_ADMIN. No account or role was changed. Use the authenticated administrator-management workflow to grant privileged access, or review the account manually through a controlled database operation.`,
                );
            }

            if (
                existingUser.status !== "ACTIVE" ||
                !existingUser.emailVerified
            ) {
                throw new Error(
                    `The configured SUPER_ADMIN account ${config.email} already exists but is not both ACTIVE and email-verified. The seed will not override its account status. Review it manually.`,
                );
            }

            console.log(
                `SUPER_ADMIN bootstrap skipped: ${config.email} already has an active, verified SUPER_ADMIN account.`,
            );

            return {
                email: existingUser.email,
                created: false,
            };
        }

        const [createdUser] = await tx
            .insert(users)
            .values({
                email: config.email,
                passwordHash,
                firstName: config.firstName,
                lastName: config.lastName,
                status: "ACTIVE",
                emailVerified: true,
            })
            .returning({
                id: users.id,
                email: users.email,
            });

        if (!createdUser) {
            throw new Error("Failed to create the bootstrap SUPER_ADMIN account.");
        }

        await tx.insert(userRoles).values({
            userId: createdUser.id,
            roleId: superAdminRole.id,
        });

        await writeAudit(tx, {
            actorUserId: createdUser.id,
            action: "SUPER_ADMIN_BOOTSTRAPPED",
            entityType: "USER",
            entityId: createdUser.id,
            metadata: {
                role: "SUPER_ADMIN",
                source: "environment_bootstrap_seed",
            },
        });

        console.log(
            `Created the initial SUPER_ADMIN account: ${createdUser.email}.`,
        );

        return {
            email: createdUser.email,
            created: true,
        };
    });
}
