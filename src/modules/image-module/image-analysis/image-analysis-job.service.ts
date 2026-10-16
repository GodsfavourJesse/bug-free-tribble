import {
    and,
    asc,
    eq,
    lte,
    or,
    sql,
} from "drizzle-orm";
import { ClaimedImageAnalysisJob, EnqueueImageAnalysisJobInput, ImageAnalysisJob } from "../../../jobs/jobs.types.ts";
import { imageAnalysisJobs } from "../../../database/schema/index.ts";
import { db } from "../../../database/index.ts";


const STALE_JOB_TIMEOUT_MS = 10 * 60 * 1000;

const DEFAULT_PRIORITY = 100;
const DEFAULT_MAX_ATTEMPTS = 3;

function mapJob(
    job: typeof imageAnalysisJobs.$inferSelect,
): ImageAnalysisJob {
    return {
        id: job.id,
        listingImageId: job.listingImageId,
        status: job.status,
        priority: job.priority,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        availableAt: job.availableAt,
        lockedAt: job.lockedAt,
        lockedBy: job.lockedBy,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        failedAt: job.failedAt,
        lastError: job.lastError,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
    };
}

/**
 * Creates a durable image-analysis job.
 *
 * This function is intentionally idempotent for an already-active job.
 * If the image already has a QUEUED or PROCESSING job, we return that job
 * instead of creating another active job for the same image.
 */
export async function enqueueImageAnalysisJob(
    input: EnqueueImageAnalysisJobInput,
): Promise<ImageAnalysisJob> {
    const priority = input.priority ?? DEFAULT_PRIORITY;
    const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

    if (!Number.isInteger(priority) || priority < 0) {
        throw new Error("Image analysis job priority must be a non-negative integer.");
    }

    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
        throw new Error("Image analysis job maxAttempts must be at least 1.");
    }

    return db.transaction(async (tx) => {
        const existingJobs = await tx
            .select()
            .from(imageAnalysisJobs)
            .where(
                and(
                    eq(imageAnalysisJobs.listingImageId, input.listingImageId),
                    or(
                        eq(imageAnalysisJobs.status, "QUEUED"),
                        eq(imageAnalysisJobs.status, "PROCESSING"),
                    ),
                ),
            )
            .orderBy(
                asc(imageAnalysisJobs.createdAt),
            )
            .limit(1);

        const existingJob = existingJobs[0];

        if (existingJob) {
            return mapJob(existingJob);
        }

        const insertedJobs = await tx
            .insert(imageAnalysisJobs)
            .values({
                listingImageId: input.listingImageId,
                status: "QUEUED",
                priority,
                attempts: 0,
                maxAttempts,
                availableAt: new Date(),
            })
            .returning();

        const insertedJob = insertedJobs[0];

        if (!insertedJob) {
            throw new Error("Failed to create image analysis job.");
        }

        return mapJob(insertedJob);
    });
}

/**
 * Marks a successfully processed job as completed.
 */
export async function completeImageAnalysisJob(
    jobId: string,
    workerId: string,
): Promise<ImageAnalysisJob> {
    const completedJobs = await db
        .update(imageAnalysisJobs)
        .set({
            status: "COMPLETED",
            completedAt: new Date(),
            lockedAt: null,
            lockedBy: null,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(imageAnalysisJobs.id, jobId),
                eq(imageAnalysisJobs.status, "PROCESSING"),
                eq(imageAnalysisJobs.lockedBy, workerId),
            ),
        )
        .returning();

    const completedJob = completedJobs[0];

    if (!completedJob) {
        throw new Error(
            "Image analysis job could not be completed because it is no longer owned by this worker.",
        );
    }

    return mapJob(completedJob);
}

/**
 * Marks a job as failed.
 *
 * If attempts remain, the job is returned to QUEUED with exponential
 * backoff. Once maxAttempts has been reached, it becomes permanently FAILED.
 */
export async function failImageAnalysisJob(
    jobId: string,
    workerId: string,
    errorMessage: string,
): Promise<ImageAnalysisJob> {
    const normalizedError =
        errorMessage.trim() || "Image analysis job failed.";

    return db.transaction(async (tx) => {
        const jobs = await tx
            .select()
            .from(imageAnalysisJobs)
            .where(
                and(
                    eq(imageAnalysisJobs.id, jobId),
                    eq(imageAnalysisJobs.status, "PROCESSING"),
                    eq(imageAnalysisJobs.lockedBy, workerId),
                ),
            )
            .limit(1);

        const job = jobs[0];

        if (!job) {
            throw new Error(
                "Image analysis job could not be failed because it is no longer owned by this worker.",
            );
        }

        const hasAttemptsRemaining =
            job.attempts < job.maxAttempts;

        const retryDelayMs = Math.min(
            60_000 * 2 ** Math.max(job.attempts - 1, 0),
            15 * 60_000,
        );

        const availableAt = new Date(
            Date.now() + retryDelayMs,
        );

        const updatedJobs = await tx
            .update(imageAnalysisJobs)
            .set({
                status: hasAttemptsRemaining
                    ? "QUEUED"
                    : "FAILED",
                availableAt: hasAttemptsRemaining
                    ? availableAt
                    : job.availableAt,
                lockedAt: null,
                lockedBy: null,
                failedAt: hasAttemptsRemaining
                    ? null
                    : new Date(),
                lastError: normalizedError,
                updatedAt: new Date(),
            })
            .where(
                eq(
                    imageAnalysisJobs.id,
                    jobId,
                ),
            )
            .returning();

        const updatedJob = updatedJobs[0];

        if (!updatedJob) {
            throw new Error(
                "Failed to update image analysis job failure state.",
            );
        }

        return mapJob(updatedJob);
    });
}

/**
 * Cancels an image-analysis job.
 *
 * Cancellation is only allowed for QUEUED or PROCESSING jobs.
 */
export async function cancelImageAnalysisJob(
    jobId: string,
): Promise<ImageAnalysisJob> {
    const cancelledJobs = await db
        .update(imageAnalysisJobs)
        .set({
            status: "CANCELLED",
            lockedAt: null,
            lockedBy: null,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(imageAnalysisJobs.id, jobId),
                or(
                    eq(
                        imageAnalysisJobs.status,
                        "QUEUED",
                    ),
                    eq(
                        imageAnalysisJobs.status,
                        "PROCESSING",
                    ),
                ),
            ),
        )
        .returning();

    const cancelledJob = cancelledJobs[0];

    if (!cancelledJob) {
        throw new Error(
            "Image analysis job could not be cancelled.",
        );
    }

    return mapJob(cancelledJob);
}

/**
 * Recovers stale image-analysis jobs.
 *
 * Stale jobs with attempts remaining are requeued.
 * Stale jobs that have exhausted their attempts are marked FAILED.
 *
 * Returns the total number of jobs recovered or marked failed.
 */
export async function recoverStaleImageAnalysisJobs(): Promise<number> {
    const staleBefore = new Date(
        Date.now() - STALE_JOB_TIMEOUT_MS,
    );

    const now = new Date();

    return db.transaction(async (tx) => {
        const exhaustedJobs = await tx
            .update(imageAnalysisJobs)
            .set({
                status: "FAILED",
                lockedAt: null,
                lockedBy: null,
                failedAt: now,
                lastError:
                    "Image analysis job exhausted its attempts after becoming stale.",
                updatedAt: now,
            })
            .where(
                and(
                    eq(
                        imageAnalysisJobs.status,
                        "PROCESSING",
                    ),
                    lte(
                        imageAnalysisJobs.lockedAt,
                        staleBefore,
                    ),
                    sql`${imageAnalysisJobs.attempts} >= ${imageAnalysisJobs.maxAttempts}`,
                ),
            )
            .returning({
                id: imageAnalysisJobs.id,
            });

        const requeuedJobs = await tx
            .update(imageAnalysisJobs)
            .set({
                status: "QUEUED",
                lockedAt: null,
                lockedBy: null,
                availableAt: now,
                lastError:
                    "Recovered stale image analysis job.",
                updatedAt: now,
            })
            .where(
                and(
                    eq(
                        imageAnalysisJobs.status,
                        "PROCESSING",
                    ),
                    lte(
                        imageAnalysisJobs.lockedAt,
                        staleBefore,
                    ),
                    sql`${imageAnalysisJobs.attempts} < ${imageAnalysisJobs.maxAttempts}`,
                ),
            )
            .returning({
                id: imageAnalysisJobs.id,
            });

        return exhaustedJobs.length + requeuedJobs.length;
    });
}

/**
 * Claims the next eligible image-analysis job.
 *
 * PostgreSQL's FOR UPDATE SKIP LOCKED allows multiple workers
 * to claim jobs concurrently without claiming the same job.
 *
 * Stale PROCESSING jobs are handled separately by
 * recoverStaleImageAnalysisJobs().
 */
export async function claimNextImageAnalysisJob(
    workerId: string,
): Promise<ClaimedImageAnalysisJob | null> {
    if (!workerId.trim()) {
        throw new Error("Worker ID is required.");
    }

    const now = new Date();

    return db.transaction(async (tx) => {
        const candidates = await tx
            .select()
            .from(imageAnalysisJobs)
            .where(
                and(
                    eq(imageAnalysisJobs.status, "QUEUED"),
                    lte(imageAnalysisJobs.availableAt, now),
                    sql`${imageAnalysisJobs.attempts} < ${imageAnalysisJobs.maxAttempts}`,
                ),
            )
            .orderBy(
                asc(imageAnalysisJobs.priority),
                asc(imageAnalysisJobs.availableAt),
                asc(imageAnalysisJobs.createdAt),
            )
            .limit(1)
            .for("update", { skipLocked: true });

        const candidate = candidates[0];

        if (!candidate) {
            return null;
        }

        const claimedJobs = await tx
            .update(imageAnalysisJobs)
            .set({
                status: "PROCESSING",
                attempts: sql`${imageAnalysisJobs.attempts} + 1`,
                lockedAt: now,
                lockedBy: workerId,
                startedAt: candidate.startedAt ?? now,
                lastError: null,
                updatedAt: now,
            })
            .where(
                and(
                    eq(imageAnalysisJobs.id, candidate.id),
                    eq(imageAnalysisJobs.status, "QUEUED"),
                ),
            )
            .returning();

        const claimedJob = claimedJobs[0];

        if (!claimedJob) {
            throw new Error(
                "Failed to claim image analysis job.",
            );
        }

        return {
            ...mapJob(claimedJob),
            workerId,
        };
    });
}