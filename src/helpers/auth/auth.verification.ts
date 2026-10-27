import {
    and,
    desc,
    eq,
    gt,
    isNull,
} from "drizzle-orm";

import { env } from "../../config/env.ts";
import { db } from "../../database/index.ts";

import {
    emailVerificationTokens,
    users,
} from "../../database/schema/index.ts";

import {
    createVerificationCode,
    createVerificationToken,
    hashVerificationValue,
} from "./auth.crypto.ts";

import {
    sendEmailVerificationEmail,
} from "../../modules/email-module/email.service.ts";

function createVerificationExpiryDate(): Date {
    const expiresAt =
        new Date();

    expiresAt.setMinutes(
        expiresAt.getMinutes() +
            env.EMAIL_VERIFICATION_TTL_MINUTES,
    );

    return expiresAt;
}

export async function createEmailVerificationChallenge(
    user: typeof users.$inferSelect,
): Promise<void> {
    const code = createVerificationCode();

    const token = createVerificationToken();

    const tokenHash = hashVerificationValue(token);

    await db.transaction(
        async (tx) => {
            /*
             * Invalidate previous unused challenges.
             */
            await tx
                .update(emailVerificationTokens)
                .set({
                    usedAt: new Date(),
                })
                .where(
                    and(
                        eq(
                            emailVerificationTokens.userId,
                            user.id,
                        ),
                        isNull(
                            emailVerificationTokens.usedAt,
                        ),
                    ),
                );

            /*
             * Store only hashed verification credentials.
             */
            await tx
                .insert(emailVerificationTokens)
                .values({
                    userId: user.id,
                    codeHash: hashVerificationValue(code),
                    tokenHash,
                    expiresAt: createVerificationExpiryDate(),
                });
        },
    );

    try {
        await sendEmailVerificationEmail({
            email: user.email,
            firstName: user.firstName,
            code,
            token,
        });
    } catch (error: unknown) {
        /*
         * SMTP failed after the token was stored.
         *
         * Invalidate the failed challenge so the next resend
         * attempt is not blocked by the cooldown.
         */
        try {
            await db
                .update(emailVerificationTokens)
                .set({
                    usedAt: new Date(),
                })
                .where(
                    and(
                        eq(
                            emailVerificationTokens.userId,
                            user.id,
                        ),
                        eq(
                            emailVerificationTokens.tokenHash,
                            tokenHash,
                        ),
                        isNull(
                            emailVerificationTokens.usedAt,
                        ),
                    ),
                );
        } catch (cleanupError: unknown) {
            console.error(
                "[AUTH] Failed to invalidate an unsent verification challenge",
                {
                    userId: user.id,
                    error:
                        cleanupError instanceof Error
                            ? cleanupError.message
                            : String(cleanupError),
                },
            );
        }

        throw error;
    }
}

export async function verifyEmailByCode(
    normalizedEmail: string,
    code: string,
) {
    const result =
        await db
            .select({
                user: users,
                verification:
                    emailVerificationTokens,
            })
            .from(
                emailVerificationTokens,
            )
            .innerJoin(
                users,
                eq(
                    emailVerificationTokens.userId,
                    users.id,
                ),
            )
            .where(
                and(
                    eq(
                        users.email,
                        normalizedEmail,
                    ),
                    isNull(
                        emailVerificationTokens.usedAt,
                    ),
                    gt(
                        emailVerificationTokens.expiresAt,
                        new Date(),
                    ),
                ),
            )
            .orderBy(
                desc(
                    emailVerificationTokens.createdAt,
                ),
            )
            .limit(1);

    const record =
        result[0];

    if (!record) {
        throw new Error(
            "Invalid or expired verification code.",
        );
    }

    if (
        record.verification
            .attempts >=
        env.AUTH_VERIFICATION_MAX_ATTEMPTS
    ) {
        throw new Error(
            "Too many verification attempts. Please request a new code.",
        );
    }

    const valid =
        hashVerificationValue(
            code.trim(),
        ) ===
        record.verification
            .codeHash;

    if (!valid) {
        await db
            .update(
                emailVerificationTokens,
            )
            .set({
                attempts:
                    record
                        .verification
                        .attempts + 1,
            })
            .where(
                eq(
                    emailVerificationTokens.id,
                    record
                        .verification
                        .id,
                ),
            );

        throw new Error(
            "Invalid or expired verification code.",
        );
    }

    return completeEmailVerification(
        record.user.id,
        record.verification.id,
    );
}

export async function verifyEmailByToken(
    token: string,
) {
    const tokenHash =
        hashVerificationValue(
            token.trim(),
        );

    const result =
        await db
            .select({
                user: users,
                verification:
                    emailVerificationTokens,
            })
            .from(
                emailVerificationTokens,
            )
            .innerJoin(
                users,
                eq(
                    emailVerificationTokens.userId,
                    users.id,
                ),
            )
            .where(
                and(
                    eq(
                        emailVerificationTokens.tokenHash,
                        tokenHash,
                    ),
                    isNull(
                        emailVerificationTokens.usedAt,
                    ),
                    gt(
                        emailVerificationTokens.expiresAt,
                        new Date(),
                    ),
                ),
            )
            .limit(1);

    const record =
        result[0];

    if (!record) {
        throw new Error(
            "Invalid or expired verification link.",
        );
    }

    return completeEmailVerification(
        record.user.id,
        record.verification.id,
    );
}

async function completeEmailVerification(
    userId: string,
    verificationId: string,
) {
    return db.transaction(
        async (tx) => {
            const updated =
                await tx
                    .update(users)
                    .set({
                        emailVerified:
                            true,
                        updatedAt:
                            new Date(),
                    })
                    .where(
                        eq(
                            users.id,
                            userId,
                        ),
                    )
                    .returning();

            await tx
                .update(
                    emailVerificationTokens,
                )
                .set({
                    usedAt:
                        new Date(),
                })
                .where(
                    eq(
                        emailVerificationTokens.id,
                        verificationId,
                    ),
                );

            const user =
                updated[0];

            if (!user) {
                throw new Error(
                    "Unable to verify email address.",
                );
            }

            return user;
        },
    );
}

export async function resendVerificationEmail(
    email: string,
): Promise<void> {
    const normalizedEmail =
        email
            .trim()
            .toLowerCase();

    const result =
        await db
            .select()
            .from(users)
            .where(
                eq(
                    users.email,
                    normalizedEmail,
                ),
            )
            .limit(1);

    const user =
        result[0];

    /*
     * Never reveal whether an account exists.
     */
    if (
        !user ||
        user.emailVerified
    ) {
        return;
    }

    const latest =
        await db
            .select()
            .from(
                emailVerificationTokens,
            )
            .where(
                and(
                    eq(
                        emailVerificationTokens.userId,
                        user.id,
                    ),
                    isNull(
                        emailVerificationTokens.usedAt,
                    ),
                ),
            )
            .orderBy(
                desc(
                    emailVerificationTokens.createdAt,
                ),
            )
            .limit(1);

    const lastCreatedAt =
        latest[0]?.createdAt;

    if (lastCreatedAt) {
        const secondsSinceLast =
            (Date.now() -
                lastCreatedAt.getTime()) /
            1000;

        if (
            secondsSinceLast <
            env.AUTH_VERIFICATION_RESEND_COOLDOWN_SECONDS
        ) {
            return;
        }
    }

    /*
     * Limit excessive resend requests.
     */
    const oneHourAgo =
        new Date(
            Date.now() -
                60 * 60 * 1000,
        );

    const recent =
        await db
            .select()
            .from(
                emailVerificationTokens,
            )
            .where(
                and(
                    eq(
                        emailVerificationTokens.userId,
                        user.id,
                    ),
                    gt(
                        emailVerificationTokens.createdAt,
                        oneHourAgo,
                    ),
                ),
            );

    if (
        recent.length >=
        env.AUTH_VERIFICATION_MAX_RESENDS_PER_HOUR
    ) {
        return;
    }

    await createEmailVerificationChallenge(
        user,
    );
}