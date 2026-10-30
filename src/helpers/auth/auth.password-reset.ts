import argon2 from "argon2";

import {
    and,
    desc,
    eq,
    gt,
    isNull,
} from "drizzle-orm";

import { db } from "../../database/index.ts";

import {
    passwordResetTokens,
    users,
} from "../../database/schema/index.ts";

import {
    createPasswordResetToken,
    hashVerificationValue,
    normalizeEmail,
} from "./auth.crypto.ts";

import { env } from "../../config/env.ts";

import {
    sendPasswordResetEmail,
} from "../../modules/email-module/email.service.ts";
import { emailQueue } from "../../infrastructure/queues/queues.ts";

function createExpiryDate(): Date {
    return new Date(
        Date.now() +
            env.PASSWORD_RESET_TTL_MINUTES *
                60 *
                1000,
    );
}

export async function requestPasswordReset(
    email: string,
): Promise<void> {
    const normalizedEmail = normalizeEmail(email);

    const result = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

    const user = result[0];

    // Never reveal whether an account exists.
    if (
        !user ||
        user.status !== "ACTIVE" ||
        !user.emailVerified
    ) {
        return;
    }

    const latest = await db
        .select({
            createdAt: passwordResetTokens.createdAt,
        })
        .from(passwordResetTokens)
        .where(
            and(
                eq(passwordResetTokens.userId, user.id),
                isNull(passwordResetTokens.usedAt),
                gt(passwordResetTokens.expiresAt, new Date()),
            ),
        )
        .orderBy(desc(passwordResetTokens.createdAt))
        .limit(1);

    const latestCreatedAt = latest[0]?.createdAt;

    if (latestCreatedAt) {
        const elapsedSeconds =
            (Date.now() - latestCreatedAt.getTime()) / 1000;

        if (
            elapsedSeconds <
            env.PASSWORD_RESET_RESEND_COOLDOWN_SECONDS
        ) {
            return;
        }
    }

    const token = createPasswordResetToken();
    const tokenHash = hashVerificationValue(token);
    const expiresAt = createExpiryDate();

    await db.transaction(async (tx) => {
        await tx
            .update(passwordResetTokens)
            .set({
                usedAt: new Date(),
            })
            .where(
                and(
                    eq(passwordResetTokens.userId, user.id),
                    isNull(passwordResetTokens.usedAt),
                ),
            );

        await tx
            .insert(passwordResetTokens)
            .values({
                userId: user.id,
                tokenHash,
                expiresAt,
            });
    });

    // Queue email delivery instead of waiting for SMTP.
    await emailQueue.add(
        "password-reset",
        {
            type: "PASSWORD_RESET",
            email: user.email,
            firstName: user.firstName,
            token,
        },
        {
            attempts: 3,
            backoff: {
                type: "exponential",
                delay: 3000,
            },
            removeOnComplete: true,
            removeOnFail: {
                age: 7 * 24 * 60 * 60,
                count: 1000,
            },
        },
    );
}

export async function resetPassword(
    token: string,
    newPassword: string,
): Promise<string> {
    const tokenHash =
        hashVerificationValue(
            token.trim(),
        );

    const result =
        await db.transaction(
            async (tx) => {
                const matches =
                    await tx
                        .select({
                            token:
                                passwordResetTokens,
                            user: users,
                        })
                        .from(
                            passwordResetTokens,
                        )
                        .innerJoin(
                            users,
                            eq(
                                passwordResetTokens.userId,
                                users.id,
                            ),
                        )
                        .where(
                            and(
                                eq(
                                    passwordResetTokens.tokenHash,
                                    tokenHash,
                                ),
                                isNull(
                                    passwordResetTokens.usedAt,
                                ),
                                gt(
                                    passwordResetTokens.expiresAt,
                                    new Date(),
                                ),
                                eq(
                                    users.status,
                                    "ACTIVE",
                                ),
                            ),
                        )
                        .limit(1);

                const record =
                    matches[0];

                if (!record) {
                    throw new Error(
                        "Invalid or expired password reset link.",
                    );
                }

                const passwordHash = await argon2.hash(
                    newPassword
                );

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
                            record.user.id,
                        ),
                    );

                await tx
                    .update(
                        passwordResetTokens,
                    )
                    .set({
                        usedAt:
                            new Date(),
                    })
                    .where(
                        eq(
                            passwordResetTokens.id,
                            record.token.id,
                        ),
                    );

                return record.user.id;
            },
        );

    return result;
}