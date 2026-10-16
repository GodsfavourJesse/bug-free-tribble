import {
    and,
    eq,
    isNull,
} from "drizzle-orm";

import {
    db,
} from "../../database/index.ts";
import { writeAuditRecord } from "../../helpers/audit/audit.service.ts";

import {
    listings,
    sessions,
    userPrivacySettings,
    users,
} from "../../database/schema/index.ts";

import {
    AppError,
} from "../../errors/app-error.ts";

import {
    sanitizeUser,
} from "./me-helpers/me.helpers.ts";

import {
    writeAuditLog,
} from "./me-helpers/me.audit.ts";

import {
    ensurePrivacySettings,
} from "./me-helpers/me.privacy.ts";

import type {
    UpdateMeInput,
    UpdatePrivacyInput,
} from "./me.validation.ts";

/**
 * Retrieves the authenticated user's account and privacy settings.
 */
export async function getMyAccount(
    userId: string,
) {
    const result = await db
        .select()
        .from(users)
        .where(
            eq(
                users.id,
                userId,
            ),
        )
        .limit(1);

    const user = result[0];

    if (!user) {
        throw new AppError(
            "Account not found.",
            404,
            "USER_NOT_FOUND",
        );
    }

    if (user.status === "DELETED") {
        throw new AppError(
            "This account has been deleted.",
            410,
            "ACCOUNT_DELETED",
        );
    }

    if (user.status === "SUSPENDED") {
        throw new AppError(
            "This account is suspended.",
            403,
            "ACCOUNT_SUSPENDED",
        );
    }

    const privacy = await ensurePrivacySettings(
        userId,
    );

    return {
        user: sanitizeUser(user),
        privacy,
    };
}

/**
 * Updates the authenticated user's profile.
 */
export async function updateMyAccount(
    userId: string,
    input: UpdateMeInput,
) {
    const existing = await db
        .select()
        .from(users)
        .where(
            eq(
                users.id,
                userId,
            ),
        )
        .limit(1);

    const user = existing[0];

    if (!user) {
        throw new AppError(
            "Account not found.",
            404,
            "USER_NOT_FOUND",
        );
    }

    if (user.status !== "ACTIVE") {
        throw new AppError(
            user.status === "SUSPENDED"
                ? "This account is suspended."
                : "This account has been deleted.",
            403,
            user.status === "SUSPENDED"
                ? "ACCOUNT_SUSPENDED"
                : "ACCOUNT_DELETED",
        );
    }

    const updateData: Partial<
        typeof users.$inferInsert
    > = {
        updatedAt: new Date(),
    };

    if (input.firstName !== undefined) {
        updateData.firstName = input.firstName;
    }

    if (input.lastName !== undefined) {
        updateData.lastName = input.lastName;
    }

    if (input.phone !== undefined) {
        updateData.phone = input.phone;
    }

    if (input.avatarUrl !== undefined) {
        updateData.avatarUrl = input.avatarUrl;
    }

    if (input.profileMetadata !== undefined) {
        updateData.profileMetadata = input.profileMetadata;
    }

    const updated = await db
        .update(users)
        .set(updateData)
        .where(
            and(
                eq(users.id, userId),
                eq(users.status, "ACTIVE"),
            ),
        )
        .returning();

    const updatedUser = updated[0];

    if (!updatedUser) {
        throw new AppError(
            "Unable to update account.",
            500,
            "ACCOUNT_UPDATE_FAILED",
        );
    }

    await writeAuditLog(
        userId,
        "USER_PROFILE_UPDATED",
    );

    const privacy = await ensurePrivacySettings(
        userId,
    );

    return {
        user: sanitizeUser(updatedUser),
        privacy,
    };
}

/**
 * Retrieves the authenticated user's privacy settings.
 */
export async function getPrivacySettings(
    userId: string,
) {
    return ensurePrivacySettings(
        userId,
    );
}

/**
 * Updates the authenticated user's privacy settings.
 */
export async function updatePrivacySettings(
    userId: string,
    input: UpdatePrivacyInput,
) {
    await ensurePrivacySettings(
        userId,
    );

    const updated = await db
        .update(userPrivacySettings)
        .set({
            ...input,
            updatedAt: new Date(),
        })
        .where(
            eq(
                userPrivacySettings.userId,
                userId,
            ),
        )
        .returning();

    const settings = updated[0];

    if (!settings) {
        throw new AppError(
            "Unable to update privacy settings.",
            500,
            "PRIVACY_UPDATE_FAILED",
        );
    }

    await writeAuditLog(
        userId,
        "USER_PRIVACY_UPDATED",
    );

    return settings;
}

/**
 * Soft-deletes and anonymizes the authenticated user's account.
 *
 * Related records are retained to preserve referential integrity.
 */
export async function deleteMyAccount(
    userId: string,
) {
    const now = new Date();

    const existing = await db
        .select()
        .from(users)
        .where(
            eq(
                users.id,
                userId,
            ),
        )
        .limit(1);

    const user = existing[0];

    if (!user) {
        throw new AppError(
            "Account not found.",
            404,
            "USER_NOT_FOUND",
        );
    }

    if (user.status === "DELETED") {
        throw new AppError(
            "Account has already been deleted.",
            410,
            "ACCOUNT_ALREADY_DELETED",
        );
    }

    if (user.status !== "ACTIVE") {
        throw new AppError(
            "Only an active account can be deleted through this endpoint.",
            403,
            "ACCOUNT_NOT_ACTIVE",
        );
    }

    await db.transaction(
        async (tx) => {
            /*
             * Anonymize the account and retain its database row.
             */
            await tx
                .update(users)
                .set({
                    email:
                        `deleted+${user.id}@deleted.karmass.local`,
                    passwordHash: "ACCOUNT_DELETED",
                    firstName: "Deleted",
                    lastName: "User",
                    phone: null,
                    avatarUrl: null,
                    profileMetadata: {},
                    status: "DELETED",
                    emailVerified: false,
                    deletionRequestedAt: now,
                    deletedAt: now,
                    updatedAt: now,
                })
                .where(
                    and(
                        eq(users.id, userId),
                        eq(users.status, "ACTIVE"),
                    ),
                );

            /*
             * Remove the account's listings from public availability.
             */
            await tx
                .update(listings)
                .set({
                    status: "SUSPENDED",
                    updatedAt: now,
                })
                .where(
                    eq(
                        listings.sellerId,
                        userId,
                    ),
                );

            /*
             * Revoke all unrevoked customer sessions.
             */
            await tx
                .update(sessions)
                .set({
                    revokedAt: now,
                })
                .where(
                    and(
                        eq(
                            sessions.userId,
                            userId,
                        ),
                        isNull(
                            sessions.revokedAt,
                        ),
                    ),
                );

            /*
             * Record the deletion in the same transaction.
             */
            await writeAuditRecord(tx, {
                actorUserId: userId,
                action: "USER_ACCOUNT_DELETED",
                entityType: "user",
                entityId: userId,
                metadata: {
                    deletedAt: now.toISOString(),
                },
            });
        },
    );

    return {
        deleted: true,
    };
}