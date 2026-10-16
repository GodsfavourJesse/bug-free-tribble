import {
    and,
    eq,
} from "drizzle-orm";

import { db } from "../../database/index.ts";

import {
    permissions,
    rolePermissions,
    roles,
    userRoles,
} from "../../database/schema/index.ts";

import type {
    Permission,
    RbacRole,
} from "./rbac.constants.ts";

export async function getUserRoles(
    userId: string,
): Promise<RbacRole[]> {
    const result = await db
        .select({
            role: roles.name,
        })
        .from(userRoles)
        .innerJoin(
            roles,
            eq(
                userRoles.roleId,
                roles.id,
            ),
        )
        .where(
            eq(
                userRoles.userId,
                userId,
            ),
        );

    return result
        .map(
            (row) =>
                row.role as RbacRole,
        );
}

export async function getUserPermissions(
    userId: string,
): Promise<Permission[]> {
    const result = await db
        .select({
            permission:
                permissions.key,
        })
        .from(userRoles)
        .innerJoin(
            rolePermissions,
            eq(
                userRoles.roleId,
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
            eq(
                userRoles.userId,
                userId,
            ),
        );

    return [
        ...new Set(
            result.map(
                (row) =>
                    row.permission as Permission,
            ),
        ),
    ];
}

export async function userHasPermission(
    userId: string,
    permission: Permission,
): Promise<boolean> {
    const result = await db
        .select({
            permissionId:
                permissions.id,
        })
        .from(userRoles)
        .innerJoin(
            rolePermissions,
            eq(
                userRoles.roleId,
                rolePermissions.roleId,
            ),
        )
        .innerJoin(
            permissions,
            and(
                eq(
                    rolePermissions.permissionId,
                    permissions.id,
                ),
                eq(
                    permissions.key,
                    permission,
                ),
            ),
        )
        .where(
            eq(
                userRoles.userId,
                userId,
            ),
        )
        .limit(1);

    return Boolean(
        result[0],
    );
}

export async function userHasAnyPermission(
    userId: string,
    requiredPermissions: readonly Permission[],
): Promise<boolean> {
    for (const permission of requiredPermissions) {
        if (
            await userHasPermission(
                userId,
                permission,
            )
        ) {
            return true;
        }
    }

    return false;
}

export async function userHasAllPermissions(
    userId: string,
    requiredPermissions: readonly Permission[],
): Promise<boolean> {
    for (const permission of requiredPermissions) {
        if (
            !(await userHasPermission(
                userId,
                permission,
            ))
        ) {
            return false;
        }
    }

    return true;
}