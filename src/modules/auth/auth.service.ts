import argon2 from "argon2";

import {
    eq,
} from "drizzle-orm";

import { AppError } from "../../errors/app-error.ts";

import { db } from "../../database/index.ts";

import {
    roles,
    sessions,
    userRoles,
    users,
} from "../../database/schema/index.ts";

import {
    createSession,
    getUserFromSession as findUserFromSession,
    listUserSessions,
    logoutUser as revokeCurrentSession,
    revokeAllUserSessions,
    revokeSessionById,
} from "../../helpers/auth/auth.session.ts";

import {
    createEmailVerificationChallenge,
    resendVerificationEmail as resendVerification,
    verifyEmailByCode as verifyCode,
    verifyEmailByToken as verifyToken,
} from "../../helpers/auth/auth.verification.ts";

import {
    getNumberSetting,
} from "../../helpers/auth/auth.settings.ts";

import {
    normalizeEmail,
} from "../../helpers/auth/auth.crypto.ts";

import {
    requestPasswordReset,
    resetPassword,
} from "../../helpers/auth/auth.password-reset.ts";

import {
    assertLoginAllowed,
    clearLoginFailures,
    recordLoginFailure,
    recordSecurityEvent,
} from "./auth.security.ts";

import type {
    LoginUserInput,
    RegisterUserInput,
    SessionMetadata,
} from "./auth.types.ts";
import { CREDIT_REASONS, grantCredits } from "../credits/credit.service.ts";
import { notifyAdminsOfNewRegistration } from "../admin-module/admin-users/admin-users.notifications.ts";

function sanitizeUser(
    user: typeof users.$inferSelect,
) {
    return {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        accountType: user.accountType,
        status: user.status,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    };
}

export async function registerUser(
    input: RegisterUserInput,
    metadata: SessionMetadata = {},
) {
    const email =
        normalizeEmail(
            input.email,
        );

    const existing =
        await db
            .select({
                id: users.id,
            })
            .from(users)
            .where(
                eq(
                    users.email,
                    email,
                ),
            )
            .limit(1);

    if (existing[0]) {
        throw new AppError(
            "An account with this email already exists.",
            409,
            "EMAIL_ALREADY_REGISTERED",
        );
    }

    const passwordHash =
        await argon2.hash(
            input.password,
        );

    const freeCredits =
        await getNumberSetting(
            "free_listing_credits",
        );

    let createdUser:
        | typeof users.$inferSelect
        | undefined;

    try {
        createdUser =
            await db.transaction(
                async (tx) => {
                    const inserted =
                        await tx
                            .insert(users)
                            .values({
                                email,
                                passwordHash,
                                firstName:
                                    input.firstName.trim(),
                                lastName:
                                    input.lastName.trim(),
                                ...(input.phone !==
                                undefined
                                    ? {
                                          phone:
                                              input.phone.trim(),
                                      }
                                    : {}),
                            })
                            .returning();

                    const user =
                        inserted[0];

                    if (!user) {
                        throw new AppError(
                            "Unable to create account.",
                        );
                    }

                    const role =
                        await tx
                            .select({
                                id: roles.id,
                            })
                            .from(roles)
                            .where(
                                eq(
                                    roles.name,
                                    "CUSTOMER",
                                ),
                            )
                            .limit(1);

                    const userRole =
                        role[0];

                    if (!userRole) {
                        throw new AppError(
                            "Default CUSTOMER role has not been seeded.",
                            500,
                            "DEFAULT_ROLE_NOT_CONFIGURED",
                        );
                    }

                    await tx
                        .insert(
                            userRoles,
                        )
                        .values({
                            userId:
                                user.id,
                            roleId:
                                userRole.id,
                        });

                    if (freeCredits > 0) {
                        await grantCredits(
                            {
                                userId: user.id,
                                amount: Math.floor(freeCredits),
                                reason: CREDIT_REASONS.FREE_TRIAL,
                                referenceId: user.id,
                            },
                            tx,
                        );
                    }

                    return user;
                },
            );
    } catch (error) {
        if (
            error instanceof
            AppError
        ) {
            throw error;
        }

        throw new AppError(
            "Unable to create account.",
            500,
            "REGISTRATION_FAILED",
        );
    }

    if (!createdUser) {
        throw new AppError(
            "Unable to create account.",
        );
    }

    await recordSecurityEvent({
        action:
            "AUTH_REGISTER_SUCCESS",
        entityType:
            "user",
        entityId:
            createdUser.id,
        ...metadata,
    });

    /*
     * Email sending occurs after the database transaction.
     * If SMTP fails, the user can request verification again.
     */
    await createEmailVerificationChallenge(
        createdUser,
    );

    /*
     * Notify administrators after the user has been
     * successfully created and the verification challenge
     * has been generated.
     *
     * Notification failures must not invalidate registration.
     */
    try {
        await notifyAdminsOfNewRegistration({
            userId: createdUser.id,
            firstName: createdUser.firstName,
            lastName: createdUser.lastName,
            email: createdUser.email,
        });
    } catch (error) {
        // Registration must remain successful if admin notification delivery fails.
        console.error(
            "Failed to notify administrators of new registration.",
            error,
        );
    }

    return {
        user:
            sanitizeUser(
                createdUser,
            ),
        requiresEmailVerification:
            true,
    };
}

export async function loginUser(
    input: LoginUserInput,
    metadata: SessionMetadata = {},
) {
    const email =
        normalizeEmail(
            input.email,
        );

    const ipAddress =
        metadata.ipAddress ??
        "unknown";

    await assertLoginAllowed(
        email,
        ipAddress,
    );

    const result =
        await db
            .select()
            .from(users)
            .where(
                eq(
                    users.email,
                    email,
                ),
            )
            .limit(1);

    const user =
        result[0];

    /*
     * Do not distinguish between
     * unknown account and invalid password.
     */
    if (!user) {
        await recordLoginFailure({
            email,
            ipAddress,
            ...metadata,
        });

        throw new AppError(
            "Invalid email or password.",
            401,
            "INVALID_CREDENTIALS",
        );
    }

    if (
        user.status !==
        "ACTIVE"
    ) {
        await recordLoginFailure({
            email,
            ipAddress,
            userId:
                user.id,
            ...metadata,
        });

        throw new AppError(
            "Invalid email or password.",
            401,
            "INVALID_CREDENTIALS",
        );
    }

    const validPassword =
        await argon2.verify(
            user.passwordHash,
            input.password,
        );

    if (!validPassword) {
        const lock =
            await recordLoginFailure({
                email,
                ipAddress,
                userId:
                    user.id,
                ...metadata,
            });

        if (lock.locked) {
            throw new AppError(
                "Too many failed login attempts. Please try again later.",
                429,
                "ACCOUNT_TEMPORARILY_LOCKED",
            );
        }

        throw new AppError(
            "Invalid email or password.",
            401,
            "INVALID_CREDENTIALS",
        );
    }

    if (
        !user.emailVerified
    ) {
        await recordSecurityEvent({
            actorUserId:
                user.id,
            action:
                "AUTH_LOGIN_BLOCKED_UNVERIFIED",
            entityType:
                "user",
            entityId:
                user.id,
            ...metadata,
        });

        throw new AppError(
            "Please verify your email address before logging in.",
            403,
            "EMAIL_NOT_VERIFIED",
        );
    }

    await clearLoginFailures(
        email,
        ipAddress,
    );

    const token =
        await createSession(
            user.id,
            metadata,
        );

    await recordSecurityEvent({
        actorUserId:
            user.id,
        action:
            "AUTH_LOGIN_SUCCESS",
        entityType:
            "user",
        entityId:
            user.id,
        ...metadata,
    });

    return {
        user:
            sanitizeUser(user),
        token,
    };
}

export async function verifyEmailByCode(
    email: string,
    code: string,
) {
    const user =
        await verifyCode(
            normalizeEmail(email),
            code,
        );

    await recordSecurityEvent({
        actorUserId:
            user.id,
        action:
            "AUTH_EMAIL_VERIFIED",
        entityType:
            "user",
        entityId:
            user.id,
    });

    return sanitizeUser(
        user,
    );
}

export async function verifyEmailByToken(
    token: string,
) {
    const user =
        await verifyToken(
            token,
        );

    await recordSecurityEvent({
        actorUserId:
            user.id,
        action:
            "AUTH_EMAIL_VERIFIED",
        entityType:
            "user",
        entityId:
            user.id,
    });

    return sanitizeUser(
        user,
    );
}

export async function resendVerificationEmail(
    email: string,
): Promise<void> {
    await resendVerification(
        email,
    );
}

export async function getUserFromSession(
    rawToken: string,
) {
    const user =
        await findUserFromSession(
            rawToken,
        );

    return user
        ? sanitizeUser(user)
        : null;
}

export async function logoutUser(
    rawToken: string,
    metadata: SessionMetadata = {},
): Promise<void> {
    const user = rawToken
        ? await findUserFromSession(rawToken)
        : null;

    await revokeCurrentSession(rawToken);

    if (user) {
        await recordSecurityEvent({
            actorUserId: user.id,
            action: "AUTH_LOGOUT_SUCCESS",
            entityType: "user",
            entityId: user.id,
            ...metadata,
        });
    }
}

export async function getSessions(
    userId: string,
    currentToken?: string,
) {
    return listUserSessions(
        userId,
        currentToken,
    );
}

export async function revokeSession(
    userId: string,
    sessionId: string,
): Promise<void> {
    const revoked =
        await revokeSessionById(
            userId,
            sessionId,
        );

    if (!revoked) {
        throw new AppError(
            "Session not found.",
            404,
            "SESSION_NOT_FOUND",
        );
    }

    await recordSecurityEvent({
        actorUserId:
            userId,
        action:
            "AUTH_SESSION_REVOKED",
        entityType:
            "session",
        entityId:
            sessionId,
    });
}

export async function revokeAllSessions(
    userId: string,
): Promise<number> {
    const count =
        await revokeAllUserSessions(
            userId,
        );

    await recordSecurityEvent({
        actorUserId:
            userId,
        action:
            "AUTH_ALL_SESSIONS_REVOKED",
        entityType:
            "user",
        entityId:
            userId,
        metadata: {
            revokedCount:
                count,
        },
    });

    return count;
}

export async function forgotPassword(
    email: string,
): Promise<void> {
    await requestPasswordReset(
        email,
    );

    /*
     * Deliberately generic.
     */
}

export async function resetUserPassword(
    token: string,
    newPassword: string,
): Promise<void> {
    const userId =
        await resetPassword(
            token,
            newPassword,
        );

    /*
     * Password reset invalidates every
     * existing authenticated session.
     */
    await revokeAllUserSessions(
        userId,
    );

    await recordSecurityEvent({
        actorUserId:
            userId,
        action:
            "AUTH_PASSWORD_RESET",
        entityType:
            "user",
        entityId:
            userId,
    });
}

export async function changeUserPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
): Promise<void> {
    const result =
        await db
            .select()
            .from(users)
            .where(
                eq(
                    users.id,
                    userId,
                ),
            )
            .limit(1);

    const user =
        result[0];

    if (!user) {
        throw new AppError(
            "Account not found.",
            404,
            "USER_NOT_FOUND",
        );
    }

    const valid =
        await argon2.verify(
            user.passwordHash,
            currentPassword,
        );

    if (!valid) {
        await recordSecurityEvent({
            actorUserId:
                userId,
            action:
                "AUTH_PASSWORD_CHANGE_FAILED",
            entityType:
                "user",
            entityId:
                userId,
        });

        throw new AppError(
            "Current password is incorrect.",
            400,
            "CURRENT_PASSWORD_INVALID",
        );
    }

    if (
        currentPassword ===
        newPassword
    ) {
        throw new AppError(
            "New password must be different from your current password.",
            400,
            "PASSWORD_NOT_CHANGED",
        );
    }

    const passwordHash =
        await argon2.hash(
            newPassword,
        );

    await db.transaction(
        async (tx) => {
            await tx
                .update(users)
                .set({
                    passwordHash,
                    updatedAt:
                        new Date(),
                })
                .where(
                    eq(
                        users.id,
                        userId,
                    ),
                );

            await tx
                .update(sessions)
                .set({
                    revokedAt:
                        new Date(),
                })
                .where(
                    eq(
                        sessions.userId,
                        userId,
                    ),
                );
        },
    );

    await recordSecurityEvent({
        actorUserId:
            userId,
        action:
            "AUTH_PASSWORD_CHANGED",
        entityType:
            "user",
        entityId:
            userId,
    });
}