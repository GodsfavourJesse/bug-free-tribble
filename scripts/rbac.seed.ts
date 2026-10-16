import {
    eq,
} from "drizzle-orm";

import { db } from "../src/database/index.ts";

import {
    permissions,
    rolePermissions,
    roles,
    userRoles,
} from "../src/database/schema/index.ts";

import {
    PERMISSION_DESCRIPTIONS,
    PERMISSIONS,
    RBAC_ROLES,
    ROLE_PERMISSIONS,
} from "../src/modules/rbac/rbac.constants.ts";

const ROLE_DESCRIPTIONS: Record<
    (typeof RBAC_ROLES)[number],
    string
> = {
    SUPER_ADMIN:
        "Full platform administrative access.",

    ADMIN:
        "Operational platform administration.",

    SUPPORT:
        "Customer support and moderation access.",

    CUSTOMER:
        "Standard KARMASS customer account.",
};

/**
 * Migrates the legacy USER role to CUSTOMER.
 *
 * This handles two possible database states:
 *
 * 1. USER exists and CUSTOMER does not.
 *    -> Rename USER to CUSTOMER while preserving
 *       the existing role ID and user assignments.
 *
 * 2. USER and CUSTOMER both exist.
 *    -> Move USER assignments to CUSTOMER,
 *       remove USER role permissions,
 *       then delete the legacy USER role.
 *
 * This makes the seed safe to run against an
 * existing KARMASS database.
 */
async function migrateLegacyUserRole(
    tx: Parameters<
        Parameters<typeof db.transaction>[0]
    >[0],
): Promise<void> {
    const userRoleRows = await tx
        .select()
        .from(roles)
        .where(eq(roles.name, "USER"))
        .limit(1);

    const customerRoleRows = await tx
        .select()
        .from(roles)
        .where(eq(roles.name, "CUSTOMER"))
        .limit(1);

    const legacyUserRole =
        userRoleRows[0];

    const customerRole =
        customerRoleRows[0];

    /*
     * Nothing to migrate.
     */
    if (!legacyUserRole) {
        return;
    }

    /*
     * CUSTOMER does not exist yet.
     *
     * Rename USER -> CUSTOMER.
     *
     * This is preferable to creating a new role
     * because all existing userRoles references
     * continue pointing to the same role ID.
     */
    if (!customerRole) {
        await tx
            .update(roles)
            .set({
                name: "CUSTOMER",
                description:
                    ROLE_DESCRIPTIONS.CUSTOMER,
                updatedAt: new Date(),
            })
            .where(
                eq(
                    roles.id,
                    legacyUserRole.id,
                ),
            );

        return;
    }

    /*
     * Both USER and CUSTOMER already exist.
     *
     * Existing users assigned to USER must be
     * transferred to CUSTOMER.
     */
    const legacyAssignments =
        await tx
            .select({
                userId:
                    userRoles.userId,
            })
            .from(userRoles)
            .where(
                eq(
                    userRoles.roleId,
                    legacyUserRole.id,
                ),
            );

    for (const assignment of legacyAssignments) {
        await tx
            .insert(userRoles)
            .values({
                userId:
                    assignment.userId,
                roleId:
                    customerRole.id,
            })
            .onConflictDoNothing();
    }

    /*
     * Remove old USER assignments.
     */
    await tx
        .delete(userRoles)
        .where(
            eq(
                userRoles.roleId,
                legacyUserRole.id,
            ),
        );

    /*
     * Remove any old USER permissions.
     *
     * CUSTOMER permissions are rebuilt from the
     * canonical ROLE_PERMISSIONS matrix below.
     */
    await tx
        .delete(rolePermissions)
        .where(
            eq(
                rolePermissions.roleId,
                legacyUserRole.id,
            ),
        );

    /*
     * Finally remove the obsolete USER role.
     */
    await tx
        .delete(roles)
        .where(
            eq(
                roles.id,
                legacyUserRole.id,
            ),
        );
}

/**
 * Seed the complete KARMASS RBAC system.
 *
 * This function is the single source of truth
 * for:
 *
 * - system roles
 * - system permissions
 * - role/permission assignments
 *
 * It is safe to run repeatedly.
 */
export async function seedRbac(): Promise<void> {
    await db.transaction(
        async (tx) => {
            /*
             * --------------------------------------------------
             * 1. Migrate legacy USER -> CUSTOMER
             * --------------------------------------------------
             */
            await migrateLegacyUserRole(
                tx,
            );

            /*
             * --------------------------------------------------
             * 2. Seed permissions
             * --------------------------------------------------
             *
             * Every permission defined in
             * PERMISSIONS must exist.
             */
            for (const key of PERMISSIONS) {
                await tx
                    .insert(permissions)
                    .values({
                        key,
                        description:
                            PERMISSION_DESCRIPTIONS[
                                key
                            ],
                    })
                    .onConflictDoUpdate({
                        target:
                            permissions.key,
                        set: {
                            description:
                                PERMISSION_DESCRIPTIONS[
                                    key
                                ],
                            updatedAt:
                                new Date(),
                        },
                    });
            }

            /*
             * --------------------------------------------------
             * 3. Seed roles
             * --------------------------------------------------
             */
            for (const roleName of RBAC_ROLES) {
                await tx
                    .insert(roles)
                    .values({
                        name: roleName,
                        description:
                            ROLE_DESCRIPTIONS[
                                roleName
                            ],
                    })
                    .onConflictDoUpdate({
                        target:
                            roles.name,
                        set: {
                            description:
                                ROLE_DESCRIPTIONS[
                                    roleName
                                ],
                            updatedAt:
                                new Date(),
                        },
                    });
            }

            /*
             * --------------------------------------------------
             * 4. Resolve database IDs
             * --------------------------------------------------
             */
            const roleRows =
                await tx
                    .select()
                    .from(roles);

            const permissionRows =
                await tx
                    .select()
                    .from(permissions);

            const roleMap =
                new Map<
                    string,
                    string
                >(
                    roleRows.map(
                        (role) => [
                            role.name,
                            role.id,
                        ],
                    ),
                );

            const permissionMap =
                new Map<
                    string,
                    string
                >(
                    permissionRows.map(
                        (permission) => [
                            permission.key,
                            permission.id,
                        ],
                    ),
                );

            /*
             * --------------------------------------------------
             * 5. Validate all canonical roles exist
             * --------------------------------------------------
             */
            for (const roleName of RBAC_ROLES) {
                if (
                    !roleMap.has(
                        roleName,
                    )
                ) {
                    throw new Error(
                        `RBAC role "${roleName}" was not found after seeding.`,
                    );
                }
            }

            /*
             * --------------------------------------------------
             * 6. Validate all canonical permissions exist
             * --------------------------------------------------
             */
            for (const permissionKey of PERMISSIONS) {
                if (
                    !permissionMap.has(
                        permissionKey,
                    )
                ) {
                    throw new Error(
                        `RBAC permission "${permissionKey}" was not found after seeding.`,
                    );
                }
            }

            /*
             * --------------------------------------------------
             * 7. Rebuild role-permission matrix
             * --------------------------------------------------
             *
             * Existing mappings for the system roles are
             * completely rebuilt from ROLE_PERMISSIONS.
             *
             * This guarantees that removed permissions do not
             * remain attached accidentally.
             */
            for (const roleName of RBAC_ROLES) {
                const roleId =
                    roleMap.get(
                        roleName,
                    );

                if (!roleId) {
                    throw new Error(
                        `RBAC role "${roleName}" was not found after seeding.`,
                    );
                }

                /*
                 * Remove existing mappings.
                 */
                await tx
                    .delete(
                        rolePermissions,
                    )
                    .where(
                        eq(
                            rolePermissions.roleId,
                            roleId,
                        ),
                    );

                const permissionKeys =
                    ROLE_PERMISSIONS[
                        roleName
                    ];

                /*
                 * CUSTOMER intentionally has no
                 * administrative permissions.
                 */
                if (
                    permissionKeys.length ===
                    0
                ) {
                    continue;
                }

                const mappings =
                    permissionKeys.map(
                        (
                            permissionKey,
                        ) => {
                            const permissionId =
                                permissionMap.get(
                                    permissionKey,
                                );

                            if (
                                !permissionId
                            ) {
                                throw new Error(
                                    `RBAC permission "${permissionKey}" was not found after seeding.`,
                                );
                            }

                            return {
                                roleId,
                                permissionId,
                            };
                        },
                    );

                await tx
                    .insert(
                        rolePermissions,
                    )
                    .values(
                        mappings,
                    );
            }
        },
    );
}