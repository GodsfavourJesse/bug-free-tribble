import {
    and,
    desc,
    eq,
    gt,
    isNull,
} from "drizzle-orm";

import { db } from "../../database/index.ts";

import {
    sessions,
    users,
} from "../../database/schema/index.ts";

import {
    createSessionToken,
    hashSessionToken,
} from "./auth.crypto.ts";

import type {
    SessionMetadata,
} from "../../modules/auth/auth.types.ts";
import { env } from "../../config/env.ts";

function createExpiryDate(): Date {
    const expiresAt = new Date();

    expiresAt.setDate(
        expiresAt.getDate() +
            envSessionTtlDays(),
    );

    return expiresAt;
}

function envSessionTtlDays(): number {
    return env.SESSION_TTL_DAYS;
}

export async function createSession(
    userId: string,
    metadata: SessionMetadata = {},
): Promise<string> {
    const rawToken =
        createSessionToken();

    const tokenHash =
        hashSessionToken(rawToken);

    const sessionData:
        typeof sessions.$inferInsert = {
        userId,
        tokenHash,
        expiresAt:
            createExpiryDate(),
    };

    if (
        metadata.userAgent !==
        undefined
    ) {
        sessionData.userAgent =
            metadata.userAgent;
    }

    if (
        metadata.ipAddress !==
        undefined
    ) {
        sessionData.ipAddress =
            metadata.ipAddress;
    }

    await db
        .insert(sessions)
        .values(sessionData);

    return rawToken;
}

export async function getUserFromSession(
    rawToken: string,
) {
    if (
        !rawToken ||
        rawToken.trim().length ===
            0
    ) {
        return null;
    }

    const tokenHash =
        hashSessionToken(rawToken);

    const now = new Date();

    const result = await db
        .select({
            user: users,
            session: sessions,
        })
        .from(sessions)
        .innerJoin(
            users,
            eq(
                sessions.userId,
                users.id,
            ),
        )
        .where(
            and(
                eq(
                    sessions.tokenHash,
                    tokenHash,
                ),
                isNull(
                    sessions.revokedAt,
                ),
                eq(
                    users.status,
                    "ACTIVE",
                ),
                eq(
                    users.emailVerified,
                    true,
                ),
                gt(
                    sessions.expiresAt,
                    now,
                ),
            ),
        )
        .limit(1);

    const record = result[0];

    if (!record) {
        return null;
    }

    await db
        .update(sessions)
        .set({
            lastUsedAt: now,
        })
        .where(
            eq(
                sessions.id,
                record.session.id,
            ),
        );

    return record.user;
}

export async function logoutUser(
    rawToken: string,
): Promise<void> {
    if (
        !rawToken ||
        rawToken.trim().length ===
            0
    ) {
        return;
    }

    const tokenHash =
        hashSessionToken(rawToken);

    await db
        .update(sessions)
        .set({
            revokedAt: new Date(),
        })
        .where(
            and(
                eq(
                    sessions.tokenHash,
                    tokenHash,
                ),
                isNull(
                    sessions.revokedAt,
                ),
            ),
        );
}

export async function listUserSessions(
    userId: string,
    currentToken?: string,
) {
    const currentTokenHash =
        currentToken
            ? hashSessionToken(
                  currentToken,
              )
            : null;

    const rows = await db
        .select({
            id: sessions.id,
            userAgent:
                sessions.userAgent,
            ipAddress:
                sessions.ipAddress,
            createdAt:
                sessions.createdAt,
            lastUsedAt:
                sessions.lastUsedAt,
            expiresAt:
                sessions.expiresAt,
            revokedAt:
                sessions.revokedAt,
        })
        .from(sessions)
        .where(
            and(
                eq(
                    sessions.userId,
                    userId,
                ),
                isNull(
                    sessions.revokedAt,
                ),
                gt(
                    sessions.expiresAt,
                    new Date(),
                ),
            ),
        )
        .orderBy(
            desc(
                sessions.lastUsedAt,
            ),
            desc(
                sessions.createdAt,
            ),
        );

    if (!currentTokenHash) {
        return rows.map(
            (session) => ({
                ...session,
                isCurrent: false,
            }),
        );
    }

    const current =
        await db
            .select({
                id: sessions.id,
            })
            .from(sessions)
            .where(
                and(
                    eq(
                        sessions.userId,
                        userId,
                    ),
                    eq(
                        sessions.tokenHash,
                        currentTokenHash,
                    ),
                ),
            )
            .limit(1);

    const currentId =
        current[0]?.id;

    return rows.map(
        (session) => ({
            ...session,
            isCurrent:
                session.id ===
                currentId,
        }),
    );
}

export async function revokeSessionById(
    userId: string,
    sessionId: string,
): Promise<boolean> {
    const result = await db
        .update(sessions)
        .set({
            revokedAt: new Date(),
        })
        .where(
            and(
                eq(
                    sessions.id,
                    sessionId,
                ),
                eq(
                    sessions.userId,
                    userId,
                ),
                isNull(
                    sessions.revokedAt,
                ),
            ),
        )
        .returning({
            id: sessions.id,
        });

    return Boolean(
        result[0],
    );
}

export async function revokeAllUserSessions(
    userId: string,
): Promise<number> {
    const result = await db
        .update(sessions)
        .set({
            revokedAt: new Date(),
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
        )
        .returning({
            id: sessions.id,
        });

    return result.length;
}