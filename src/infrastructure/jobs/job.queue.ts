import { and, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "../../database/index.ts";
import { jobs } from "../../database/schema/index.ts";

export const JOB_TYPES = [
    "IMAGE_ANALYSIS",
    "NOTIFICATION_DISPATCH",
    "LIFECYCLE",
] as const;

export type JobType = (typeof JOB_TYPES)[number];

export interface EnqueueJobInput {
    type: JobType;
    payload: Record<string, unknown>;
    availableAt?: Date;
    maxAttempts?: number;
}

export interface FailJobInput {
    jobId: string;
    workerId: string;
    error: string;
    retryAt?: Date;
    terminal?: boolean;
}

export interface ClaimedJob {
    id: string;
    type: JobType;
    status: "PROCESSING";
    payload: Record<string, unknown>;
    attempts: number;
    maxAttempts: number;
    availableAt: Date;
    lockedAt: Date | null;
    lockedBy: string | null;
    lastError: string | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

function assertNonEmpty(value: string, label: string): void {
    if (!value.trim()) {
        throw new Error(`${label} is required.`);
    }
}

function assertPositiveInteger(value: number, label: string): void {
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${label} must be a positive integer.`);
    }
}


export async function enqueueJob(input: EnqueueJobInput): Promise<string> {
    if (!JOB_TYPES.includes(input.type)) {
        throw new Error("Unsupported job type.");
    }

    const maxAttempts = input.maxAttempts ?? 5;

    assertPositiveInteger(maxAttempts, "maxAttempts");

    if (
        input.availableAt !== undefined &&
        Number.isNaN(input.availableAt.getTime())
    ) {
        throw new Error("availableAt must be a valid date.");
    }

    const result = await db
        .insert(jobs)
        .values({
            type: input.type,
            payload: input.payload,
            availableAt: input.availableAt ?? new Date(),
            maxAttempts,
        })
        .returning({
            id: jobs.id,
        });

    const job = result[0];

    if (!job) {
        throw new Error("Failed to enqueue job.");
    }

    return job.id;
}

function mapClaimedJob(
    row: Record<string, unknown>,
): ClaimedJob {
    if (
        typeof row.id !== "string" ||
        typeof row.type !== "string" ||
        typeof row.payload !== "object" ||
        row.payload === null ||
        Array.isArray(row.payload) ||
        typeof row.attempts !== "number" ||
        typeof row.max_attempts !== "number" ||
        !(
            row.available_at instanceof Date ||
            typeof row.available_at === "string"
        ) ||
        typeof row.created_at !== "string" &&
            !(row.created_at instanceof Date) ||
        typeof row.updated_at !== "string" &&
            !(row.updated_at instanceof Date)
    ) {
        throw new Error("Claimed job has an invalid database row shape.");
    }

    if (
        row.type !== "IMAGE_ANALYSIS" &&
        row.type !== "NOTIFICATION_DISPATCH" &&
        row.type !== "LIFECYCLE"
    ) {
        throw new Error("Claimed job has an unsupported type.");
    }

    const toDate = (value: unknown): Date => {
        if (value instanceof Date) {
            return value;
        }

        if (typeof value === "string") {
            const date = new Date(value);

            if (!Number.isNaN(date.getTime())) {
                return date;
            }
        }

        throw new Error("Claimed job contains an invalid date.");
    };

    const nullableDate = (value: unknown): Date | null => {
        if (value === null || value === undefined) {
            return null;
        }

        return toDate(value);
    };

    if (row.status !== "PROCESSING") {
        throw new Error("Claimed job is not in PROCESSING status.");
    }

    if (
        row.locked_by !== null &&
        typeof row.locked_by !== "string"
    ) {
        throw new Error("Claimed job has an invalid worker lock.");
    }

    if (
        row.last_error !== null &&
        typeof row.last_error !== "string"
    ) {
        throw new Error("Claimed job has an invalid error field.");
    }

    return {
        id: row.id,
        type: row.type,
        status: "PROCESSING",
        payload: row.payload as Record<string, unknown>,
        attempts: row.attempts,
        maxAttempts: row.max_attempts,
        availableAt: toDate(row.available_at),
        lockedAt: nullableDate(row.locked_at),
        lockedBy: typeof row.locked_by === "string"
            ? row.locked_by
            : null,
        lastError: typeof row.last_error === "string"
            ? row.last_error
            : null,
        completedAt: nullableDate(row.completed_at),
        createdAt: toDate(row.created_at),
        updatedAt: toDate(row.updated_at),
    };
}

export async function claimNextJob(
    workerId: string,
    supportedTypes: readonly JobType[],
): Promise<ClaimedJob | null> {
    assertNonEmpty(workerId, "Worker ID");

    if (supportedTypes.length === 0) {
        return null;
    }

    const uniqueTypes = [...new Set(supportedTypes)];

    return db.transaction(async (tx) => {
        const rows = await tx.execute(sql`
            WITH candidate AS (
                SELECT id
                FROM jobs
                WHERE status = 'QUEUED'
                  AND available_at <= now()
                  AND attempts < max_attempts
                  AND type = ANY(
                      ARRAY[
                          ${sql.join(
                              uniqueTypes.map((type) => sql`${type}`),
                              sql`, `,
                          )}
                      ]::job_type[]
                  )
                ORDER BY available_at ASC, created_at ASC
                FOR UPDATE SKIP LOCKED
                LIMIT 1
            )
            UPDATE jobs AS j
            SET status = 'PROCESSING',
                attempts = j.attempts + 1,
                locked_at = now(),
                locked_by = ${workerId},
                updated_at = now()
            FROM candidate
            WHERE j.id = candidate.id
              AND j.status = 'QUEUED'
              AND j.attempts < j.max_attempts
            RETURNING j.*
        `);

        const row = rows.rows[0];

        if (!row) {
            return null;
        }

        return mapClaimedJob(row);
    });
}

export async function completeJob(
    jobId: string,
    workerId: string,
): Promise<boolean> {
    assertNonEmpty(jobId, "Job ID");
    assertNonEmpty(workerId, "Worker ID");

    const result = await db
        .update(jobs)
        .set({
            status: "COMPLETED",
            completedAt: new Date(),
            lockedAt: null,
            lockedBy: null,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(jobs.id, jobId),
                eq(jobs.status, "PROCESSING"),
                eq(jobs.lockedBy, workerId),
            ),
        )
        .returning({
            id: jobs.id,
        });

    return result.length > 0;
}

export async function failJob(input: FailJobInput): Promise<boolean> {
    assertNonEmpty(input.jobId, "Job ID");
    assertNonEmpty(input.workerId, "Worker ID");

    if (
        input.retryAt !== undefined &&
        Number.isNaN(input.retryAt.getTime())
    ) {
        throw new Error("retryAt must be a valid date.");
    }

    const errorMessage = input.error.slice(0, 4000);

    const result = await db
        .update(jobs)
        .set({
            status: input.terminal ? "FAILED" : "QUEUED",
            lastError: errorMessage,
            availableAt: input.retryAt ?? new Date(),
            lockedAt: null,
            lockedBy: null,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(jobs.id, input.jobId),
                eq(jobs.status, "PROCESSING"),
                eq(jobs.lockedBy, input.workerId),
                input.terminal === true
                    ? sql`${jobs.attempts} >= ${jobs.maxAttempts}`
                    : sql`${jobs.attempts} < ${jobs.maxAttempts}`,
            ),
        )
        .returning({
            id: jobs.id,
        });

    return result.length > 0;
}

/**
 * Recover jobs abandoned by workers that stopped unexpectedly.
 *
 * Jobs that have exhausted their attempts are marked FAILED rather
 * than being returned to the queue.
 */
export async function recoverStaleJobs(
    timeoutMinutes = 15,
): Promise<void> {
    assertPositiveInteger(timeoutMinutes, "timeoutMinutes");

    await db.execute(sql`
        UPDATE jobs
        SET status = CASE
                WHEN attempts >= max_attempts THEN 'FAILED'::job_status
                ELSE 'QUEUED'::job_status
            END,
            last_error = CASE
                WHEN attempts >= max_attempts
                    THEN COALESCE(
                        last_error,
                        'Worker stopped and maximum attempts were exhausted.'
                    )
                ELSE last_error
            END,
            locked_at = NULL,
            locked_by = NULL,
            updated_at = now()
        WHERE status = 'PROCESSING'
          AND locked_at < now() - make_interval(mins => ${timeoutMinutes})
    `);
}

export function newWorkerId(prefix = "karmass-worker"): string {
    assertNonEmpty(prefix, "Worker prefix");

    return `${prefix}-${randomUUID()}`;
}
