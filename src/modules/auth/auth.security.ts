import {
    and,
    eq,
    gt,
    isNull,
    lte,
} from "drizzle-orm";

import { sql } from "drizzle-orm";

import { env } from "../../config/env.ts";
import { db } from "../../database/index.ts";

import {
    authLoginThrottles,
} from "../../database/schema/index.ts";
import { writeAuditRecord } from "../../helpers/audit/audit.service.ts";

import {
    hashLoginThrottleKey,
} from "../../helpers/auth/auth.crypto.ts";

export interface SecurityEventInput {
    actorUserId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: unknown;
}

export async function recordSecurityEvent(
    input: SecurityEventInput,
): Promise<void> {
    await writeAuditRecord(db, input);
}

function createThrottleKey(
    email: string,
    ipAddress: string,
): string {
    return hashLoginThrottleKey(
        email,
        ipAddress,
    );
}

export async function assertLoginAllowed(
    email: string,
    ipAddress: string,
): Promise<void> {
    const keyHash =
        createThrottleKey(
            email,
            ipAddress,
        );

    const now = new Date();

    const result = await db
        .select({
            lockedUntil:
                authLoginThrottles.lockedUntil,
        })
        .from(authLoginThrottles)
        .where(
            eq(
                authLoginThrottles.keyHash,
                keyHash,
            ),
        )
        .limit(1);

    const row = result[0];

    if (
        row?.lockedUntil &&
        row.lockedUntil > now
    ) {
        throw new Error(
            "Too many failed login attempts. Please try again later.",
        );
    }
}

export async function recordLoginFailure(
    input: {
        email: string;
        ipAddress: string;
        userId?: string;
        userAgent?: string;
    },
): Promise<{
    locked: boolean;
}> {
    const keyHash =
        createThrottleKey(
            input.email,
            input.ipAddress,
        );

    const now = new Date();

    const result =
        await db.transaction(
            async (tx) => {
                await tx.execute(
                    sql`
                        SELECT pg_advisory_xact_lock(
                            hashtext(${keyHash})
                        )
                    `,
                );

                const existing =
                    await tx
                        .select()
                        .from(
                            authLoginThrottles,
                        )
                        .where(
                            eq(
                                authLoginThrottles.keyHash,
                                keyHash,
                            ),
                        )
                        .limit(1);

                const row =
                    existing[0];

                if (!row) {
                    const lockedUntil =
                        new Date(
                            now.getTime() +
                                env.AUTH_LOGIN_LOCKOUT_MINUTES *
                                    60 *
                                    1000,
                        );

                    /*
                     * The first failure should not lock
                     * the account.
                     */
                    const inserted =
                        await tx
                            .insert(
                                authLoginThrottles,
                            )
                            .values({
                                keyHash,
                                ...(input.userId !==
                                undefined
                                    ? {
                                          userId:
                                              input.userId,
                                      }
                                    : {}),
                                failedAttempts:
                                    1,
                                windowStartedAt:
                                    now,
                                lastAttemptAt:
                                    now,
                                createdAt:
                                    now,
                                updatedAt:
                                    now,
                            })
                            .returning();

                    return {
                        locked:
                            Number(
                                inserted[0]
                                    ?.failedAttempts ??
                                    0,
                            ) >=
                            env.AUTH_LOGIN_MAX_ATTEMPTS,
                        failedAttempts:
                            Number(
                                inserted[0]
                                    ?.failedAttempts ??
                                    0,
                            ),
                    };
                }

                const windowExpired =
                    now.getTime() -
                        row.windowStartedAt.getTime() >
                    env.AUTH_LOGIN_WINDOW_MINUTES *
                        60 *
                        1000;

                const nextAttempts =
                    windowExpired
                        ? 1
                        : row.failedAttempts + 1;

                const shouldLock =
                    nextAttempts >=
                    env.AUTH_LOGIN_MAX_ATTEMPTS;

                const lockedUntil =
                    shouldLock
                        ? new Date(
                              now.getTime() +
                                  env.AUTH_LOGIN_LOCKOUT_MINUTES *
                                      60 *
                                      1000,
                          )
                        : null;

                await tx
                    .update(
                        authLoginThrottles,
                    )
                    .set({
                        ...(input.userId !==
                        undefined
                            ? {
                                  userId:
                                      input.userId,
                              }
                            : {}),
                        failedAttempts:
                            nextAttempts,
                        windowStartedAt:
                            windowExpired
                                ? now
                                : row.windowStartedAt,
                        lockedUntil,
                        lastAttemptAt:
                            now,
                        updatedAt:
                            now,
                    })
                    .where(
                        eq(
                            authLoginThrottles.id,
                            row.id,
                        ),
                    );

                return {
                    locked:
                        shouldLock,
                    failedAttempts:
                        nextAttempts,
                };
            },
        );

    await recordSecurityEvent({
        ...(input.userId !== undefined
            ? {
                  actorUserId:
                      input.userId,
              }
            : {}),
        action: result.locked
            ? "AUTH_LOGIN_LOCKED"
            : "AUTH_LOGIN_FAILED",
        entityType: "authentication",
        ...(input.ipAddress !==
        undefined
            ? {
                  ipAddress:
                      input.ipAddress,
              }
            : {}),
        ...(input.userAgent !==
        undefined
            ? {
                  userAgent:
                      input.userAgent,
              }
            : {}),
        metadata: {
            failedAttempts:
                result.failedAttempts,
        },
    });

    return {
        locked: result.locked,
    };
}

export async function clearLoginFailures(
    email: string,
    ipAddress: string,
): Promise<void> {
    const keyHash =
        createThrottleKey(
            email,
            ipAddress,
        );

    await db
        .delete(authLoginThrottles)
        .where(
            eq(
                authLoginThrottles.keyHash,
                keyHash,
            ),
        );
}

export async function cleanupLoginThrottles(): Promise<void> {
    const threshold = new Date(
        Date.now() -
            24 * 60 * 60 * 1000,
    );

    await db
        .delete(authLoginThrottles)
        .where(
            and(
                isNull(
                    authLoginThrottles.lockedUntil,
                ),
                lte(
                    authLoginThrottles.updatedAt,
                    threshold,
                ),
            ),
        );
}