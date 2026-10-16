import {
    and,
    eq,
    inArray,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    adminSessions,
    roles,
    sessions,
    userRoles,
    users,
} from "../../../database/schema/index.ts";

import { AppError } from "../../../errors/app-error.ts";
import { writeAudit } from "../admin.service.ts";

const ASSIGNABLE_ROLE_NAMES = ["SUPER_ADMIN", "ADMIN", "SUPPORT", "CUSTOMER"] as const;

async function getUserOrThrow(
    executor: Pick<typeof db, "select">,
    userId: string,
) {
    const rows = await executor
        .select({
            id: users.id,
            email: users.email,
            status: users.status,
            firstName: users.firstName,
            lastName: users.lastName,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    const user = rows[0];

    if (!user) {
        throw new AppError("User account not found.", 404, "USER_NOT_FOUND");
    }

    return user;
}

async function revokeAllSessions(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    userId: string,
    now: Date,
): Promise<void> {
    await tx.update(sessions)
        .set({ revokedAt: now })
        .where(eq(sessions.userId, userId));

    await tx.update(adminSessions)
        .set({ revokedAt: now })
        .where(eq(adminSessions.userId, userId));
}

export async function changeUserStatus(
    input: {
        userId: string;
        actorId: string;
        action: "SUSPEND" | "UNSUSPEND" | "DELETE";
        reason?: string;
        ipAddress?: string;
        userAgent?: string;
    },
) {
    if (input.userId === input.actorId) {
        throw new AppError(
            "You cannot suspend, unsuspend, or delete your own administrator account.",
            409,
            "SELF_ACCOUNT_ACTION_FORBIDDEN",
        );
    }

    return db.transaction(async (tx) => {
        const target = await getUserOrThrow(tx, input.userId);

        const targetRoleRows = await tx
            .select({ name: roles.name })
            .from(userRoles)
            .innerJoin(roles, eq(roles.id, userRoles.roleId))
            .where(eq(userRoles.userId, target.id));

        const targetRoles = targetRoleRows.map((row) => row.name);
        const isSuperAdmin = targetRoles.includes("SUPER_ADMIN");

        if (isSuperAdmin) {
            throw new AppError(
                "A SUPER_ADMIN account cannot be modified through user status actions. Use the dedicated role-governance procedure.",
                403,
                "SUPER_ADMIN_PROTECTED",
            );
        }

        const now = new Date();
        let status: "ACTIVE" | "SUSPENDED" | "DELETED";

        if (input.action === "SUSPEND") {
            if (target.status === "DELETED") {
                throw new AppError("Deleted accounts cannot be suspended.", 409, "USER_ALREADY_DELETED");
            }
            if (target.status === "SUSPENDED") {
                throw new AppError("User is already suspended.", 409, "USER_ALREADY_SUSPENDED");
            }
            status = "SUSPENDED";
        } else if (input.action === "UNSUSPEND") {
            if (target.status === "DELETED") {
                throw new AppError("Deleted accounts cannot be unsuspended.", 409, "USER_ALREADY_DELETED");
            }
            if (target.status !== "SUSPENDED") {
                throw new AppError("Only suspended accounts can be unsuspended.", 409, "USER_NOT_SUSPENDED");
            }
            status = "ACTIVE";
        } else {
            if (target.status === "DELETED") {
                throw new AppError("User account is already deleted.", 409, "USER_ALREADY_DELETED");
            }
            status = "DELETED";
        }

        const updatedRows = await tx
            .update(users)
            .set({
                status,
                ...(status === "DELETED" ? { deletedAt: now } : {}),
                updatedAt: now,
            })
            .where(eq(users.id, target.id))
            .returning({
                id: users.id,
                email: users.email,
                status: users.status,
                updatedAt: users.updatedAt,
                deletedAt: users.deletedAt,
            });

        const updated = updatedRows[0];

        if (!updated) {
            throw new AppError("Unable to update user status.", 500, "USER_STATUS_UPDATE_FAILED");
        }

        if (status !== "ACTIVE") {
            await revokeAllSessions(tx, target.id, now);
        }

        await writeAudit(tx, {
            actorUserId: input.actorId,
            action: input.action === "SUSPEND"
                ? "USER_SUSPENDED"
                : input.action === "UNSUSPEND"
                  ? "USER_UNSUSPENDED"
                  : "USER_DELETED",
            entityType: "USER",
            entityId: target.id,
            ...(input.ipAddress !== undefined ? { ipAddress: input.ipAddress } : {}),
            ...(input.userAgent !== undefined ? { userAgent: input.userAgent } : {}),
            metadata: {
                previousStatus: target.status,
                newStatus: status,
                reason: input.reason ?? null,
            },
        });

        return updated;
    });
}

export async function replaceUserRoles(
    input: {
        userId: string;
        actorId: string;
        roleNames: string[];
        ipAddress?: string;
        userAgent?: string;
    },
) {
    if (input.userId === input.actorId) {
        throw new AppError(
            "You cannot change your own administrator roles.",
            409,
            "SELF_ROLE_CHANGE_FORBIDDEN",
        );
    }

    const requested = [...new Set(input.roleNames)];

    if (requested.length === 0) {
        throw new AppError("At least one role must be assigned.", 400, "ROLE_REQUIRED");
    }

    if (requested.some((name) => !(ASSIGNABLE_ROLE_NAMES as readonly string[]).includes(name))) {
        throw new AppError("One or more requested roles are invalid.", 400, "INVALID_ROLE");
    }

    return db.transaction(async (tx) => {
        const target = await getUserOrThrow(tx, input.userId);

        if (target.status === "DELETED") {
            throw new AppError("Roles cannot be changed for a deleted account.", 409, "USER_ALREADY_DELETED");
        }

        const currentRoleRows = await tx
            .select({ id: roles.id, name: roles.name })
            .from(userRoles)
            .innerJoin(roles, eq(roles.id, userRoles.roleId))
            .where(eq(userRoles.userId, target.id));

        const currentRoleNames = currentRoleRows.map((row) => row.name);
        const removingSuperAdmin = currentRoleNames.includes("SUPER_ADMIN") && !requested.includes("SUPER_ADMIN");

        if (removingSuperAdmin) {
            const superAdminRows = await tx
                .select({ userId: userRoles.userId })
                .from(userRoles)
                .innerJoin(roles, eq(roles.id, userRoles.roleId))
                .innerJoin(users, eq(users.id, userRoles.userId))
                .where(and(
                    eq(roles.name, "SUPER_ADMIN"),
                    eq(users.status, "ACTIVE"),
                ));

            if (superAdminRows.length <= 1) {
                throw new AppError(
                    "The last active SUPER_ADMIN role cannot be removed.",
                    409,
                    "LAST_SUPER_ADMIN_PROTECTED",
                );
            }
        }

        const roleRows = await tx
            .select({ id: roles.id, name: roles.name })
            .from(roles)
            .where(inArray(roles.name, requested));

        if (roleRows.length !== requested.length) {
            throw new AppError("One or more roles do not exist in the database. Run the RBAC seed first.", 409, "ROLE_NOT_SEEDED");
        }

        await tx.delete(userRoles).where(eq(userRoles.userId, target.id));

        await tx.insert(userRoles).values(
            roleRows.map((role) => ({
                userId: target.id,
                roleId: role.id,
            })),
        );

        await writeAudit(tx, {
            actorUserId: input.actorId,
            action: "USER_ROLES_REPLACED",
            entityType: "USER",
            entityId: target.id,
            ...(input.ipAddress !== undefined ? { ipAddress: input.ipAddress } : {}),
            ...(input.userAgent !== undefined ? { userAgent: input.userAgent } : {}),
            metadata: {
                previousRoles: currentRoleNames,
                newRoles: requested,
            },
        });

        return {
            userId: target.id,
            roles: requested,
        };
    });
}
