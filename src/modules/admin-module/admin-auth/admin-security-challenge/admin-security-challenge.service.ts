import {
    createHash,
    randomBytes,
} from "node:crypto";

import {
    and,
    eq,
    gt,
    sql,
} from "drizzle-orm";

import { db } from "../../../../database/index.ts";

import {
    adminSecurityChallenges,
} from "../../../../database/schema/auth-security.ts";

import {
    writeAuditRecord,
} from "../../../../helpers/audit/audit.service.ts";
import { getAwarenessQuestion, isCorrectAwarenessAnswer, VEHICLE_SILHOUETTE_ASSETS } from "./admin-security-challenge.questions.ts";

/**
 * KARMASS administrator security-awareness challenge.
 *
 * IMPORTANT:
 * This challenge is an additional security-awareness gate.
 * It is NOT a replacement for administrator credentials or MFA.
 */

const CHALLENGE_TTL_MINUTES = 10;
const MAX_FAILED_ATTEMPTS = 5;
const TOTAL_CHALLENGE_STAGES = 5;

const CHALLENGE_STATUS = {
    IN_PROGRESS: "IN_PROGRESS",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    EXPIRED: "EXPIRED",
    CONSUMED: "CONSUMED",
} as const;

type ChallengeStatus =
    (typeof CHALLENGE_STATUS)[keyof typeof CHALLENGE_STATUS];

export interface AdminChallengeMetadata {
    ipAddress?: string;
    userAgent?: string;
}

interface ChallengeOption {
    id: string;
    label: string;
}

interface AwarenessQuestion {
    stage: number;
    title: string;
    instruction: string;
    type: "multiple-choice" | "visual-match";
    options?: ChallengeOption[];
    referenceAsset?: string;
    imageOptions?: string[];
}

interface ChallengeRecord {
    id: string;
    tokenHash: string;
    currentStage: number;
    failedAttempts: number;
    status: string;
    expiresAt: Date;
}

export class AdminSecurityChallengeError extends Error {
    public readonly statusCode: number;
    public readonly code: string;

    constructor(
        message: string,
        statusCode: number,
        code: string,
    ) {
        super(message);

        this.name = "AdminSecurityChallengeError";
        this.statusCode = statusCode;
        this.code = code;
    }
}

function createRawChallengeToken(): string {
    return randomBytes(32).toString("base64url");
}

function hashChallengeToken(token: string): string {
    return createHash("sha256")
        .update(token, "utf8")
        .digest("hex");
}

function normalizeAnswer(answer: string): string {
    return answer.trim().toLowerCase();
}

function getChallengeExpiry(): Date {
    return new Date(
        Date.now() +
            CHALLENGE_TTL_MINUTES * 60 * 1000,
    );
}

function getSafeMetadata(
    metadata: AdminChallengeMetadata,
): AdminChallengeMetadata {
    return {
        ...(metadata.ipAddress
            ? {
                ipAddress: metadata.ipAddress.slice(
                    0,
                    64,
                ),
            }
            : {}),
        ...(metadata.userAgent
            ? {
                userAgent: metadata.userAgent.slice(
                    0,
                    500,
                ),
            }
            : {}),
    };
}

/**
 * Creates the question presented at each stage.
 *
 * Correct answers are kept on the server and are never
 * included in the question response.
 */
function getQuestion(
    stage: number,
    tokenHash: string,
): AwarenessQuestion {
    const publicStage = stage + 1;

    if (publicStage >= 1 && publicStage <= 4) {
        const question = getAwarenessQuestion(publicStage);

        if (!question || !question.options) {
            throw new AdminSecurityChallengeError(
                "The challenge question is unavailable.",
                500,
                "CHALLENGE_QUESTION_UNAVAILABLE",
            );
        }

        return {
            stage: question.stage,
            title: question.title,
            instruction: question.instruction,
            type: "multiple-choice",
            options: question.options,
        };
    }

    if (stage === 4) {
        const rankedAssets = VEHICLE_SILHOUETTE_ASSETS
            .map((asset) => ({
                asset,
                rank: createHash("sha256")
                    .update(`${tokenHash}:${asset}`, "utf8")
                    .digest("hex"),
            }))
            .sort((a, b) => a.rank.localeCompare(b.rank));

        const referenceAsset = rankedAssets[0]?.asset;

        if (!referenceAsset) {
            throw new AdminSecurityChallengeError(
                "The visual challenge is unavailable.",
                500,
                "VISUAL_CHALLENGE_UNAVAILABLE",
            );
        }

        const imageOptions = rankedAssets
            .slice(0, 4)
            .map((item) => item.asset);

        return {
            stage: 5,
            title: "Vehicle identification",
            instruction:
                "Select the silhouette that matches the reference vehicle.",
            type: "visual-match",
            referenceAsset,
            imageOptions,
        };
    }

    throw new AdminSecurityChallengeError(
        "The challenge stage is invalid.",
        400,
        "INVALID_CHALLENGE_STAGE",
    );
}

/**
 * Validates a submitted answer against the correct answer
 * held exclusively by the backend.
 */
function isCorrectAnswer(
    stage: number,
    answer: string,
    tokenHash: string,
): boolean {
    const normalized = normalizeAnswer(answer);

    if (stage >= 0 && stage <= 3) {
        return isCorrectAwarenessAnswer(
            stage + 1,
            normalized,
        );
    }

    if (stage === 4) {
        const question = getQuestion(stage, tokenHash);

        if (
            question.type !== "visual-match" ||
            !question.referenceAsset
        ) {
            return false;
        }

        return (
            normalized ===
            question.referenceAsset.toLowerCase()
        );
    }

    return false;
}

function auditMetadata(
    metadata: AdminChallengeMetadata,
): {
    ipAddress?: string;
    userAgent?: string;
} {
    const safe = getSafeMetadata(metadata);

    return {
        ...(safe.ipAddress
            ? { ipAddress: safe.ipAddress }
            : {}),
        ...(safe.userAgent
            ? { userAgent: safe.userAgent }
            : {}),
    };
}

function assertValidToken(
    token: unknown,
): asserts token is string {
    if (
        typeof token !== "string" ||
        token.length < 40 ||
        token.length > 100
    ) {
        throw new AdminSecurityChallengeError(
            "The security challenge is invalid or expired. Start again.",
            400,
            "INVALID_CHALLENGE_TOKEN",
        );
    }
}

async function getChallenge(
    tokenHash: string,
): Promise<ChallengeRecord | null> {
    const [challenge] = await db
        .select({
            id: adminSecurityChallenges.id,
            tokenHash:
                adminSecurityChallenges.tokenHash,
            currentStage:
                adminSecurityChallenges.currentStage,
            failedAttempts:
                adminSecurityChallenges.failedAttempts,
            status: adminSecurityChallenges.status,
            expiresAt:
                adminSecurityChallenges.expiresAt,
        })
        .from(adminSecurityChallenges)
        .where(
            eq(
                adminSecurityChallenges.tokenHash,
                tokenHash,
            ),
        )
        .limit(1);

    return challenge ?? null;
}

/**
 * Starts a new challenge.
 *
 * Only the token hash is stored in the database.
 * The raw token is returned once to the frontend.
 */
export async function startAdminSecurityChallenge(
    metadata: AdminChallengeMetadata = {},
): Promise<{
    challengeToken: string;
    expiresAt: string;
    totalStages: number;
    question: AwarenessQuestion;
}> {
    const safeMetadata = getSafeMetadata(metadata);

    const rawToken = createRawChallengeToken();
    const tokenHash = hashChallengeToken(rawToken);
    const expiresAt = getChallengeExpiry();

    const [challenge] = await db
        .insert(adminSecurityChallenges)
        .values({
            tokenHash,
            currentStage: 0,
            failedAttempts: 0,
            status: CHALLENGE_STATUS.IN_PROGRESS,
            challengeVersion: "v1",
            expiresAt,
            ...(safeMetadata.ipAddress
                ? {
                    ipAddress:
                        safeMetadata.ipAddress,
                }
                : {}),
            ...(safeMetadata.userAgent
                ? {
                    userAgent:
                        safeMetadata.userAgent,
                }
                : {}),
        })
        .returning({
            id: adminSecurityChallenges.id,
        });

    if (!challenge) {
        throw new AdminSecurityChallengeError(
            "Unable to start the security challenge.",
            500,
            "CHALLENGE_START_FAILED",
        );
    }

    await writeAuditRecord(db, {
        action: "ADMIN_SECURITY_CHALLENGE_STARTED",
        entityType: "ADMIN_SECURITY_CHALLENGE",
        entityId: challenge.id,
        ...auditMetadata(safeMetadata),
        metadata: {
            challengeVersion: "v1",
            totalStages: TOTAL_CHALLENGE_STAGES,
        },
    });

    return {
        challengeToken: rawToken,
        expiresAt: expiresAt.toISOString(),
        totalStages: TOTAL_CHALLENGE_STAGES,
        question: getQuestion(0, tokenHash),
    };
}

/**
 * Returns the current server-authoritative question.
 *
 * This endpoint must never return correct answers.
 */
export async function getAdminSecurityChallenge(
    challengeToken: string,
): Promise<{
    expiresAt: string;
    totalStages: number;
    completedStages: number;
    question: AwarenessQuestion;
}> {
    assertValidToken(challengeToken);

    const tokenHash =
        hashChallengeToken(challengeToken);

    const challenge = await getChallenge(tokenHash);

    if (!challenge) {
        throw new AdminSecurityChallengeError(
            "The security challenge is invalid or expired. Start again.",
            400,
            "CHALLENGE_NOT_FOUND",
        );
    }

    if (challenge.status !== CHALLENGE_STATUS.IN_PROGRESS) {
        throw new AdminSecurityChallengeError(
            "This security challenge is no longer active. Start again.",
            409,
            "CHALLENGE_NOT_ACTIVE",
        );
    }

    if (challenge.expiresAt.getTime() <= Date.now()) {
        await db
            .update(adminSecurityChallenges)
            .set({
                status: CHALLENGE_STATUS.EXPIRED,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(
                        adminSecurityChallenges.id,
                        challenge.id,
                    ),
                    eq(
                        adminSecurityChallenges.status,
                        CHALLENGE_STATUS.IN_PROGRESS,
                    ),
                ),
            );

        throw new AdminSecurityChallengeError(
            "The security challenge has expired. Start again.",
            410,
            "CHALLENGE_EXPIRED",
        );
    }

    return {
        expiresAt: challenge.expiresAt.toISOString(),
        totalStages: TOTAL_CHALLENGE_STAGES,
        completedStages: challenge.currentStage,
        question: getQuestion(
            challenge.currentStage,
            tokenHash,
        ),
    };
}

/**
 * Submits an answer for the current challenge stage.
 *
 * The database stage is checked again during the update
 * so that concurrent submissions cannot advance the same
 * stage twice.
 */
export async function submitAdminSecurityChallengeAnswer(
    input: {
        challengeToken: string;
        answer: string;
    },
    metadata: AdminChallengeMetadata = {},
): Promise<{
    completed: boolean;
    completedStages: number;
    totalStages: number;
    nextQuestion?: AwarenessQuestion;
}> {
    assertValidToken(input.challengeToken);

    if (
        typeof input.answer !== "string" ||
        input.answer.length < 1 ||
        input.answer.length > 100
    ) {
        throw new AdminSecurityChallengeError(
            "Select a valid answer.",
            400,
            "INVALID_CHALLENGE_ANSWER",
        );
    }

    const tokenHash = hashChallengeToken(
        input.challengeToken,
    );

    const challenge = await getChallenge(tokenHash);

    if (!challenge) {
        throw new AdminSecurityChallengeError(
            "The security challenge is invalid or expired. Start again.",
            400,
            "CHALLENGE_NOT_FOUND",
        );
    }

    if (challenge.status !== CHALLENGE_STATUS.IN_PROGRESS) {
        throw new AdminSecurityChallengeError(
            "This security challenge is no longer active. Start again.",
            409,
            "CHALLENGE_NOT_ACTIVE",
        );
    }

    if (challenge.expiresAt.getTime() <= Date.now()) {
        await db
            .update(adminSecurityChallenges)
            .set({
                status: CHALLENGE_STATUS.EXPIRED,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(
                        adminSecurityChallenges.id,
                        challenge.id,
                    ),
                    eq(
                        adminSecurityChallenges.status,
                        CHALLENGE_STATUS.IN_PROGRESS,
                    ),
                ),
            );

        throw new AdminSecurityChallengeError(
            "The security challenge has expired. Start again.",
            410,
            "CHALLENGE_EXPIRED",
        );
    }

    const safeMetadata = getSafeMetadata(metadata);

    const correct = isCorrectAnswer(
        challenge.currentStage,
        input.answer,
        tokenHash,
    );

    if (!correct) {
        /**
         * Increment in SQL to avoid losing increments when
         * multiple incorrect requests arrive concurrently.
         */
        const [updated] = await db
            .update(adminSecurityChallenges)
            .set({
                failedAttempts: sql`
                    ${adminSecurityChallenges.failedAttempts} + 1
                `,
                status: sql`
                    CASE
                        WHEN ${adminSecurityChallenges.failedAttempts} + 1 >= ${MAX_FAILED_ATTEMPTS}
                        THEN ${CHALLENGE_STATUS.FAILED}
                        ELSE ${CHALLENGE_STATUS.IN_PROGRESS}
                    END
                `,
                failedAt: sql`
                    CASE
                        WHEN ${adminSecurityChallenges.failedAttempts} + 1 >= ${MAX_FAILED_ATTEMPTS}
                        THEN NOW()
                        ELSE ${adminSecurityChallenges.failedAt}
                    END
                `,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(
                        adminSecurityChallenges.id,
                        challenge.id,
                    ),
                    eq(
                        adminSecurityChallenges.status,
                        CHALLENGE_STATUS.IN_PROGRESS,
                    ),
                    eq(
                        adminSecurityChallenges.currentStage,
                        challenge.currentStage,
                    ),
                    gt(
                        adminSecurityChallenges.expiresAt,
                        new Date(),
                    ),
                ),
            )
            .returning({
                id: adminSecurityChallenges.id,
                failedAttempts:
                    adminSecurityChallenges.failedAttempts,
                status: adminSecurityChallenges.status,
            });

        if (!updated) {
            throw new AdminSecurityChallengeError(
                "The challenge changed or expired. Refresh and try again.",
                409,
                "CHALLENGE_STATE_CHANGED",
            );
        }

        await writeAuditRecord(db, {
            action: "ADMIN_SECURITY_CHALLENGE_ANSWER_FAILED",
            entityType: "ADMIN_SECURITY_CHALLENGE",
            entityId: challenge.id,
            ...auditMetadata(safeMetadata),
            metadata: {
                stage: challenge.currentStage + 1,
                failedAttempts: updated.failedAttempts,
                status: updated.status,
            },
        });

        if (
            updated.status ===
            CHALLENGE_STATUS.FAILED
        ) {
            await writeAuditRecord(db, {
                action: "ADMIN_SECURITY_CHALLENGE_LOCKED",
                entityType: "ADMIN_SECURITY_CHALLENGE",
                entityId: challenge.id,
                ...auditMetadata(safeMetadata),
                metadata: {
                    reason: "MAX_FAILED_ATTEMPTS",
                },
            });

            throw new AdminSecurityChallengeError(
                "Too many incorrect answers. Start a new challenge.",
                429,
                "CHALLENGE_MAX_ATTEMPTS",
            );
        }

        throw new AdminSecurityChallengeError(
            "That answer is incorrect. Try again.",
            400,
            "CHALLENGE_ANSWER_INCORRECT",
        );
    }

    const nextStage = challenge.currentStage + 1;
    const isComplete =
        nextStage === TOTAL_CHALLENGE_STAGES;

    /**
     * Compare-and-update prevents a concurrent request
     * from advancing the same stage a second time.
     */
    const [updated] = await db
        .update(adminSecurityChallenges)
        .set({
            currentStage: nextStage,
            ...(isComplete
                ? {
                    status: CHALLENGE_STATUS.COMPLETED,
                    completedAt: new Date(),
                }
                : {}),
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(
                    adminSecurityChallenges.id,
                    challenge.id,
                ),
                eq(
                    adminSecurityChallenges.status,
                    CHALLENGE_STATUS.IN_PROGRESS,
                ),
                eq(
                    adminSecurityChallenges.currentStage,
                    challenge.currentStage,
                ),
                gt(
                    adminSecurityChallenges.expiresAt,
                    new Date(),
                ),
            ),
        )
        .returning({
            id: adminSecurityChallenges.id,
            currentStage:
                adminSecurityChallenges.currentStage,
            status: adminSecurityChallenges.status,
        });

    if (!updated) {
        throw new AdminSecurityChallengeError(
            "The challenge changed or expired. Refresh and try again.",
            409,
            "CHALLENGE_STATE_CHANGED",
        );
    }

    await writeAuditRecord(db, {
        action: isComplete
            ? "ADMIN_SECURITY_CHALLENGE_COMPLETED"
            : "ADMIN_SECURITY_CHALLENGE_STAGE_PASSED",
        entityType: "ADMIN_SECURITY_CHALLENGE",
        entityId: challenge.id,
        ...auditMetadata(safeMetadata),
        metadata: {
            completedStages: updated.currentStage,
            totalStages: TOTAL_CHALLENGE_STAGES,
        },
    });

    if (isComplete) {
        return {
            completed: true,
            completedStages: TOTAL_CHALLENGE_STAGES,
            totalStages: TOTAL_CHALLENGE_STAGES,
        };
    }

    return {
        completed: false,
        completedStages: updated.currentStage,
        totalStages: TOTAL_CHALLENGE_STAGES,
        nextQuestion: getQuestion(
            updated.currentStage,
            tokenHash,
        ),
    };
}

/**
 * Atomically consumes a completed challenge.
 *
 * This will be called from the administrator login flow
 * in a later step. A challenge cannot be consumed twice.
 */
export async function consumeAdminSecurityChallenge(
    challengeToken: string,
    metadata: AdminChallengeMetadata = {},
): Promise<void> {
    assertValidToken(challengeToken);

    const tokenHash =
        hashChallengeToken(challengeToken);

    const safeMetadata = getSafeMetadata(metadata);
    const now = new Date();

    await db.transaction(async (transaction) => {
        const [consumed] = await transaction
            .update(adminSecurityChallenges)
            .set({
                status: CHALLENGE_STATUS.CONSUMED,
                consumedAt: now,
                updatedAt: now,
            })
            .where(
                and(
                    eq(
                        adminSecurityChallenges.tokenHash,
                        tokenHash,
                    ),
                    eq(
                        adminSecurityChallenges.status,
                        CHALLENGE_STATUS.COMPLETED,
                    ),
                    eq(
                        adminSecurityChallenges.currentStage,
                        TOTAL_CHALLENGE_STAGES,
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

        if (!consumed) {
            throw new AdminSecurityChallengeError(
                "Complete a valid security challenge before signing in.",
                403,
                "CHALLENGE_REQUIRED",
            );
        }

        await writeAuditRecord(transaction, {
            action: "ADMIN_SECURITY_CHALLENGE_CONSUMED",
            entityType: "ADMIN_SECURITY_CHALLENGE",
            entityId: consumed.id,
            ...auditMetadata(safeMetadata),
            metadata: {
                purpose: "ADMIN_LOGIN",
            },
        });
    });
}