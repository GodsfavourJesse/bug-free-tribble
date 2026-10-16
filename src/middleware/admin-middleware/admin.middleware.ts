import type {
    NextFunction,
    Request,
    Response,
} from "express";

import {
    and,
    eq,
    inArray,
} from "drizzle-orm";

import {
    db,
} from "../../database/index.ts";

import {
    permissions,
    rolePermissions,
    roles,
    userRoles,
} from "../../database/schema/rbac.ts";

/**
 * Roles permitted to access administrator functionality.
 *
 * CUSTOMER is intentionally excluded.
 */
const ADMIN_ROLE_NAMES = [
    "SUPER_ADMIN",
    "ADMIN",
    "SUPPORT",
] as const;

export function requirePermission(
    permissionKey: string,
) {
    return async (
        request: Request,
        response: Response,
        next: NextFunction,
    ): Promise<void> => {
        try {
            // Administrator authentication must run first.
            const admin = request.admin;

            if (!admin) {
                response.status(401).json({
                    success: false,
                    message:
                        "Administrator authentication required.",
                });

                return;
            }

            // Verify that the administrator currently holds
            // the requested permission through an approved
            // administrator role.
            const rows = await db
                .select({
                    permission: permissions.key,
                })
                .from(userRoles)
                .innerJoin(
                    roles,
                    eq(
                        userRoles.roleId,
                        roles.id,
                    ),
                )
                .innerJoin(
                    rolePermissions,
                    eq(
                        roles.id,
                        rolePermissions.roleId,
                    ),
                )
                .innerJoin(
                    permissions,
                    eq(
                        rolePermissions.permissionId,
                        permissions.id,
                    ),
                )
                .where(
                    and(
                        eq(
                            userRoles.userId,
                            admin.id,
                        ),
                        inArray(
                            roles.name,
                            [...ADMIN_ROLE_NAMES],
                        ),
                        eq(
                            permissions.key,
                            permissionKey,
                        ),
                    ),
                )
                .limit(1);

            // The administrator is authenticated but does
            // not have the required permission.
            if (!rows[0]) {
                response.status(403).json({
                    success: false,
                    message:
                        "You do not have permission to perform this action.",
                });

                return;
            }

            // Authentication and authorization succeeded.
            next();
        } catch (error) {
            next(error);
        }
    };
}