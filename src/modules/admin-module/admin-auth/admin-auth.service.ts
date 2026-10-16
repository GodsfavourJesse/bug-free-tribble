import argon2 from "argon2";

import {
    and,
    eq,
    gt,
    isNull,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    adminSecurityChallenges,
    adminSessions,
    permissions,
    rolePermissions,
    roles,
    userRoles,
    users,
} from "../../../database/schema/index.ts";

import { env } from "../../../config/env.ts";

import {
    createSessionToken,
    hashSessionToken,
} from "../../../helpers/auth/auth.crypto.ts";
import { writeAuditRecord } from "../../../helpers/audit/audit.service.ts";
import { createHash } from "node:crypto";

export interface AdminSessionMetadata {
    userAgent?: string;
    ipAddress?: string;
}

export interface AdminLoginInput {
    email: string;
    password: string;
    challengeToken: string;
}

export interface AuthenticatedAdmin {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    avatarUrl: string | null;
    emailVerified: boolean;
    status: "ACTIVE";
    roles: string[];
    permissions: string[];
}

export class AdminAuthError extends Error {
    public readonly statusCode: number;
    public readonly code: string;

    constructor(
        message: string,
        statusCode: number,
        code = "ADMIN_AUTH_ERROR",
    ) {
        super(message);

        this.name = "AdminAuthError";
        this.statusCode = statusCode;
        this.code = code;
    }
}

const ADMIN_ROLE_NAMES = [
    "SUPER_ADMIN",
    "ADMIN",
    "SUPPORT",
] as const;

function createAdminSessionExpiry(): Date {
    const expiresAt = new Date();

    expiresAt.setDate(
        expiresAt.getDate() +
            env.SESSION_TTL_DAYS,
    );

    return expiresAt;
}

function normalizeEmail(
    email: string,
): string {
    return email.trim().toLowerCase();
}

async function getAdminRoles(
    userId: string,
): Promise<string[]> {
    const rows = await db
        .select({
            roleName: roles.name,
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

    return rows
        .map((row) => row.roleName)
        .filter((roleName) =>
            (
                ADMIN_ROLE_NAMES as readonly string[]
            ).includes(roleName),
        );
}

async function getAdminPermissions(
    userId: string,
): Promise<string[]> {
    const rows = await db
        .select({
            permissionKey: permissions.key,
            roleName: roles.name,
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
            eq(
                userRoles.userId,
                userId,
            ),
        );

    const adminPermissions = rows
        .filter((row) =>
            (
                ADMIN_ROLE_NAMES as readonly string[]
            ).includes(row.roleName),
        )
        .map((row) => row.permissionKey);

    return [
        ...new Set(adminPermissions),
    ];
}

async function getAuthenticatedAdmin(
    userId: string,
): Promise<AuthenticatedAdmin | null> {
    const result = await db
        .select({
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
            phone: users.phone,
            avatarUrl: users.avatarUrl,
            emailVerified: users.emailVerified,
            status: users.status,
        })
        .from(users)
        .where(
            and(
                eq(users.id, userId),
                eq(users.status, "ACTIVE"),
                eq(users.emailVerified, true),
            ),
        )
        .limit(1);

    const user = result[0];

    if (!user) {
        return null;
    }

    const adminRoles =
        await getAdminRoles(user.id);

    if (adminRoles.length === 0) {
        return null;
    }

    const adminPermissions =
        await getAdminPermissions(user.id);

    return {
        ...user,
        status: "ACTIVE",
        roles: adminRoles,
        permissions: adminPermissions,
    };
}

export async function loginAdmin(
    input: AdminLoginInput,
    metadata: AdminSessionMetadata = {},
): Promise<{
    admin: AuthenticatedAdmin;
    token: string;
}> {
    const email = normalizeEmail(input.email);

    const auditMetadata = {
        ...(metadata.ipAddress !== undefined
            ? { ipAddress: metadata.ipAddress }
            : {}),
        ...(metadata.userAgent !== undefined
            ? { userAgent: metadata.userAgent }
            : {}),
    };

    /*
     * Validate the challenge token before authentication.
     * The raw token is never stored in the database.
     */
    if (
        typeof input.challengeToken !== "string" ||
        input.challengeToken.length < 40 ||
        input.challengeToken.length > 100
    ) {
        await writeAuditRecord(db, {
            action: "ADMIN_LOGIN_BLOCKED_CHALLENGE",
            entityType: "ADMIN_AUTH",
            ...auditMetadata,
            metadata: {
                reason: "MISSING_OR_INVALID_CHALLENGE_TOKEN",
            },
        });

        throw new AdminAuthError(
            "Complete the security challenge before signing in.",
            403,
            "ADMIN_SECURITY_CHALLENGE_REQUIRED",
        );
    }

    const challengeTokenHash = createHash(
        "sha256",
    )
        .update(input.challengeToken, "utf8")
        .digest("hex");

    /*
     * Check credentials and account eligibility.
     * We do not create a session until all checks pass.
     */
    const result = await db
        .select({
            id: users.id,
            passwordHash: users.passwordHash,
            status: users.status,
            emailVerified: users.emailVerified,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

    const user = result[0];

    if (
        !user ||
        user.status !== "ACTIVE"
    ) {
        await writeAuditRecord(db, {
            ...(user
                ? {
                    actorUserId: user.id,
                    entityId: user.id,
                }
                : {}),
            action: "ADMIN_LOGIN_FAILED",
            entityType: "ADMIN_AUTH",
            ...auditMetadata,
            metadata: {
                reason:
                    "INVALID_CREDENTIALS_OR_INACTIVE_ACCOUNT",
            },
        });

        throw new AdminAuthError(
            "Invalid email or password.",
            401,
            "INVALID_ADMIN_CREDENTIALS",
        );
    }

    const passwordMatches = await argon2.verify(
        user.passwordHash,
        input.password,
    );

    if (!passwordMatches) {
        await writeAuditRecord(db, {
            actorUserId: user.id,
            action: "ADMIN_LOGIN_FAILED",
            entityType: "ADMIN_AUTH",
            entityId: user.id,
            ...auditMetadata,
            metadata: {
                reason: "INVALID_CREDENTIALS",
            },
        });

        throw new AdminAuthError(
            "Invalid email or password.",
            401,
            "INVALID_ADMIN_CREDENTIALS",
        );
    }

    if (!user.emailVerified) {
        await writeAuditRecord(db, {
            actorUserId: user.id,
            action: "ADMIN_LOGIN_BLOCKED_UNVERIFIED",
            entityType: "ADMIN_AUTH",
            entityId: user.id,
            ...auditMetadata,
            metadata: {
                reason: "EMAIL_NOT_VERIFIED",
            },
        });

        throw new AdminAuthError(
            "Your email address must be verified before you can sign in.",
            403,
            "ADMIN_EMAIL_NOT_VERIFIED",
        );
    }

    const admin = await getAuthenticatedAdmin(user.id);

    if (!admin) {
        await writeAuditRecord(db, {
            actorUserId: user.id,
            action: "ADMIN_LOGIN_BLOCKED_NOT_ADMIN",
            entityType: "ADMIN_AUTH",
            entityId: user.id,
            ...auditMetadata,
            metadata: {
                reason: "NO_ADMIN_ROLE",
            },
        });

        throw new AdminAuthError(
            "This account is not authorized to access the administrator portal.",
            403,
            "ADMIN_ROLE_REQUIRED",
        );
    }

    /*
     * Prepare the session. It is not persisted until the
     * challenge is atomically consumed below.
     */
    const token = createSessionToken();
    const tokenHash = hashSessionToken(token);

    const sessionData: typeof adminSessions.$inferInsert = {
        userId: user.id,
        tokenHash,
        expiresAt: createAdminSessionExpiry(),
    };

    if (metadata.userAgent !== undefined) {
        sessionData.userAgent = metadata.userAgent;
    }

    if (metadata.ipAddress !== undefined) {
        sessionData.ipAddress = metadata.ipAddress;
    }

    /*
     * CRITICAL SECURITY BOUNDARY:
     *
     * The completed challenge is consumed and the session
     * is created in the same transaction.
     *
     * The conditional UPDATE allows only one concurrent
     * request to consume a challenge.
     */
    try {
        await db.transaction(async (tx) => {
            const now = new Date();

            const consumedChallenge = await tx
                .update(adminSecurityChallenges)
                .set({
                    status: "CONSUMED",
                    consumedAt: now,
                    updatedAt: now,
                })
                .where(
                    and(
                        eq(
                            adminSecurityChallenges.tokenHash,
                            challengeTokenHash,
                        ),
                        eq(
                            adminSecurityChallenges.status,
                            "COMPLETED",
                        ),
                        eq(
                            adminSecurityChallenges.currentStage,
                            5,
                        ),
                        gt(
                            adminSecurityChallenges.expiresAt,
                            now,
                        ),
                    ),
                )
                .returning({
                    id: adminSecurityChallenges.id,
                });

            if (!consumedChallenge[0]) {
                throw new AdminAuthError(
                    "Your security challenge is invalid, expired, or already used. Start a new challenge.",
                    403,
                    "ADMIN_SECURITY_CHALLENGE_INVALID",
                );
            }

            await tx
                .insert(adminSessions)
                .values(sessionData);

            await writeAuditRecord(tx, {
                actorUserId: user.id,
                action: "ADMIN_LOGIN_SUCCEEDED",
                entityType: "ADMIN",
                entityId: user.id,
                ...auditMetadata,
                metadata: {
                    roles: admin.roles,
                    permissionCount:
                        admin.permissions.length,
                    securityChallengeVerified: true,
                },
            });
        });
    } catch (error) {
        if (error instanceof AdminAuthError) {
            await writeAuditRecord(db, {
                actorUserId: user.id,
                action: "ADMIN_LOGIN_BLOCKED_CHALLENGE",
                entityType: "ADMIN_AUTH",
                entityId: user.id,
                ...auditMetadata,
                metadata: {
                    reason: error.code,
                },
            });

            throw error;
        }

        throw error;
    }

    return {
        admin,
        token,
    };
}

export async function getAdminFromSession(
    rawToken: string,
): Promise<AuthenticatedAdmin | null> {
    if (
        !rawToken ||
        rawToken.trim().length === 0
    ) {
        return null;
    }

    const tokenHash =
        hashSessionToken(rawToken);

    const now = new Date();

    const result = await db
        .select({
            sessionId: adminSessions.id,
            userId: adminSessions.userId,
        })
        .from(adminSessions)
        .innerJoin(
            users,
            eq(
                adminSessions.userId,
                users.id,
            ),
        )
        .where(
            and(
                eq(
                    adminSessions.tokenHash,
                    tokenHash,
                ),
                isNull(
                    adminSessions.revokedAt,
                ),
                gt(
                    adminSessions.expiresAt,
                    now,
                ),
                eq(
                    users.status,
                    "ACTIVE",
                ),
                eq(
                    users.emailVerified,
                    true,
                ),
            ),
        )
        .limit(1);

    const session = result[0];

    if (!session) {
        return null;
    }

    const admin =
        await getAuthenticatedAdmin(
            session.userId,
        );

    if (!admin) {
        return null;
    }

    await db
        .update(adminSessions)
        .set({
            lastUsedAt: now,
        })
        .where(
            eq(
                adminSessions.id,
                session.sessionId,
            ),
        );

    return admin;
}

export async function logoutAdmin(
    rawToken: string,
    metadata: AdminSessionMetadata = {},
): Promise<void> {
    if (!rawToken || rawToken.trim().length === 0) {
        return;
    }

    const tokenHash = hashSessionToken(rawToken);

    const activeRows = await db
        .select({
            id: adminSessions.id,
            userId: adminSessions.userId,
        })
        .from(adminSessions)
        .where(
            and(
                eq(adminSessions.tokenHash, tokenHash),
                isNull(adminSessions.revokedAt),
            ),
        )
        .limit(1);

    const activeSession = activeRows[0];
    if (!activeSession) {
        return;
    }

    await db.transaction(async (tx) => {
        const revokedRows = await tx
            .update(adminSessions)
            .set({ revokedAt: new Date() })
            .where(
                and(
                    eq(adminSessions.id, activeSession.id),
                    isNull(adminSessions.revokedAt),
                ),
            )
            .returning({ id: adminSessions.id });

        if (!revokedRows[0]) {
            return;
        }

        await writeAuditRecord(tx, {
            actorUserId: activeSession.userId,
            action: "ADMIN_LOGOUT_SUCCEEDED",
            entityType: "ADMIN",
            entityId: activeSession.userId,
            ...(metadata.ipAddress !== undefined ? { ipAddress: metadata.ipAddress } : {}),
            ...(metadata.userAgent !== undefined ? { userAgent: metadata.userAgent } : {}),
            metadata: { sessionRevoked: true },
        });
    });
}
