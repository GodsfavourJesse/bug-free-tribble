import {
    and,
    asc,
    desc,
    eq,
    gt,
    lte,
    or,
    sql,
} from "drizzle-orm";
import { ClaimedImageAnalysisJob, EnqueueImageAnalysisJobInput, ImageAnalysisJob } from "../../../jobs/jobs.types.ts";
import { imageAnalysisJobs, imageAnalysisRuns, imageReviewDecisions, listingImages } from "../../../database/schema/index.ts";
import { db } from "../../../database/index.ts";


const STALE_JOB_TIMEOUT_MS = 10 * 60 * 1000;

const DEFAULT_PRIORITY = 100;
const DEFAULT_MAX_ATTEMPTS = 3;

const TERMINAL_IMAGE_FAILURE_REASON = "We couldn't complete the image checks after several attempts, Please try the analysis again or upload the image again. If the problem continues, contact KARMASS support. ";

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
 * Concurrency guarantees:
 * - Locks the image row before checking its eligibility.
 * - Serializes enqueue requests for the same image.
 * - Uses the same image-first locking order as admin review.
 * - Returns an existing active job instead of creating a duplicate.
 * - Preserves the database partial unique index as a final safeguard.
 */
export async function enqueueImageAnalysisJob(
    input: EnqueueImageAnalysisJobInput,
): Promise<ImageAnalysisJob> {
    const priority =
        input.priority ?? DEFAULT_PRIORITY;

    const maxAttempts =
        input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

    if (
        !Number.isInteger(priority) ||
        priority < 0
    ) {
        throw new Error(
            "Image analysis job priority must be a non-negative integer.",
        );
    }

    if (
        !Number.isInteger(maxAttempts) ||
        maxAttempts < 1
    ) {
        throw new Error(
            "Image analysis job maxAttempts must be at least 1.",
        );
    }

    return db.transaction(async (tx) => {
        const now = new Date();

        // 1. Lock the image first.

        const images = await tx
            .select({
                id: listingImages.id,
                listingId: listingImages.listingId,
                imageCheckStatus:
                    listingImages.imageCheckStatus,
                imageCheckSource:
                    listingImages.imageCheckSource,
            })
            .from(listingImages)
            .where(
                eq(
                    listingImages.id,
                    input.listingImageId,
                ),
            )
            .limit(1)
            .for("update");

        const image = images[0];

        if (!image) {
            throw new Error(
                "Cannot enqueue image analysis: listing image not found.",
            );
        }

        // 2. Never enqueue an image that has already passed.

        if (
            image.imageCheckStatus === "PASSED"
        ) {
            throw new Error(
                "Cannot enqueue image analysis: image has already passed review.",
            );
        }

        // 3. Validate eligibility BEFORE checking active jobs.

        if (input.retryTechnicalFailure) {
            if (
                image.imageCheckStatus !== "FAILED"
            ) {
                throw new Error(
                    "Only failed images can be retried through this operation.",
                );
            }

            if (
                image.imageCheckSource !== "AUTOMATED"
            ) {
                throw new Error(
                    "This image was not identified as an automated-analysis failure and cannot be retried through this operation.",
                );
            }
        } else if (
            image.imageCheckStatus !== "PENDING"
        ) {
            throw new Error(
                "Cannot enqueue image analysis: image is not awaiting analysis.",
            );
        }

        // 4. Find an existing active job only after eligibility
        // has been established.

        const existingJobs = await tx
            .select()
            .from(imageAnalysisJobs)
            .where(
                and(
                    eq(
                        imageAnalysisJobs.listingImageId,
                        image.id,
                    ),
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
            .orderBy(
                asc(
                    imageAnalysisJobs.createdAt,
                ),
            )
            .limit(1);

        const existingJob = existingJobs[0];

        if (existingJob) {
            // A retry must not silently return an active job while
            // leaving the image in FAILED status.
            if (
                input.retryTechnicalFailure
            ) {
                throw new Error(
                    "An active image-analysis job already exists for this image. Resolve the existing job before retrying.",
                );
            }

            return mapJob(existingJob);
        }

        // 5. Reset an eligible technical failure atomically.

        if (input.retryTechnicalFailure) {
            const resetImages = await tx
                .update(listingImages)
                .set({
                    imageCheckStatus: "PENDING",
                    imageCheckSource: null,
                    checkReason: null,
                    checkedAt: null,
                })
                .where(
                    and(
                        eq(
                            listingImages.id,
                            image.id,
                        ),
                        eq(
                            listingImages.imageCheckStatus,
                            "FAILED",
                        ),
                        eq(
                            listingImages.imageCheckSource,
                            "AUTOMATED",
                        ),
                    ),
                )
                .returning({
                    id: listingImages.id,
                });

            if (!resetImages[0]) {
                throw new Error(
                    "The image status changed before its retry could be queued.",
                );
            }
        }

        // 6. Create the new job in the same transaction.

        const insertedJobs = await tx
            .insert(imageAnalysisJobs)
            .values({
                listingImageId: image.id,
                status: "QUEUED",
                priority,
                attempts: 0,
                maxAttempts,
                availableAt: now,
            })
            .returning();

        const insertedJob = insertedJobs[0];

        if (!insertedJob) {
            throw new Error(
                "Failed to create image analysis job.",
            );
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
 * Records an image-analysis failure.
 *
 * Temporary failures are requeued while attempts remain.
 *
 * Once attempts are exhausted, the job, image and any still-running
 * analysis run are updated in the same transaction.
 *
 * This prevents a terminally failed job from leaving its image
 * indefinitely marked as PENDING.
 */
export async function failImageAnalysisJob(
    jobId: string,
    workerId: string,
    errorMessage: string,
): Promise<ImageAnalysisJob> {
    const normalizedError = errorMessage.trim() || "Image analysis failed.";

    return db.transaction(async (tx) => {
        const now = new Date();

        const validLockAfter = new Date(
            now.getTime() - STALE_JOB_TIMEOUT_MS,
        );

        /*
         * 1. Read the job without locking it.
         * We need its image ID before acquiring locks.
         */
        const [initialJob] = await tx
            .select({
                id: imageAnalysisJobs.id,
                listingImageId: imageAnalysisJobs.listingImageId,
            })
            .from(imageAnalysisJobs)
            .where(
                and(
                    eq(imageAnalysisJobs.id, jobId),
                    eq(imageAnalysisJobs.status, "PROCESSING"),
                    eq(imageAnalysisJobs.lockedBy, workerId),
                    gt(imageAnalysisJobs.lockedAt, validLockAfter),
                ),
            )
            .limit(1);

        if (!initialJob) {
            throw new Error(
                "Image analysis job cannot be failed because worker ownership changed or its lease expired.",
            );
        }

        /*
         * 2. Lock the image first.
         * This matches the locking order used by admin review.
         */
        const [image] = await tx
            .select({
                id: listingImages.id,
                imageCheckStatus: listingImages.imageCheckStatus,
            })
            .from(listingImages)
            .where(
                eq(listingImages.id, initialJob.listingImageId),
            )
            .limit(1)
            .for("update");

        if (!image) {
            throw new Error(
                "Cannot fail image analysis because the listing image no longer exists.",
            );
        }

        /*
         * 3. Lock and revalidate the job.
         */
        const [job] = await tx
            .select()
            .from(imageAnalysisJobs)
            .where(
                and(
                    eq(imageAnalysisJobs.id, jobId),
                    eq(imageAnalysisJobs.listingImageId, image.id),
                    eq(imageAnalysisJobs.status, "PROCESSING"),
                    eq(imageAnalysisJobs.lockedBy, workerId),
                    gt(imageAnalysisJobs.lockedAt, validLockAfter),
                ),
            )
            .limit(1)
            .for("update");

        if (!job) {
            throw new Error(
                "Image analysis job cannot be failed because worker ownership changed or its lease expired.",
            );
        }

        /*
         * 4. Never overwrite an existing image decision.
         */
        if (image.imageCheckStatus !== "PENDING") {
            throw new Error(
                "Image analysis job cannot be failed because the image is no longer pending analysis.",
            );
        }

        /*
         * 5. Determine whether another attempt is available.
         * attempts is incremented when the job is claimed.
         */
        const hasAttemptsRemaining =
            job.attempts < job.maxAttempts;

        const retryDelayMs = Math.min(
            60_000 * 2 ** Math.max(job.attempts - 1, 0),
            15 * 60_000,
        );

        const availableAt = new Date(
            now.getTime() + retryDelayMs,
        );

        /*
         * 6. Close the current RUNNING analysis run.
         *
         * Do this for BOTH retryable and terminal failures.
         * The run must represent one completed attempt, not
         * remain RUNNING while the job waits for a retry.
         */
        await tx
            .update(imageAnalysisRuns)
            .set({
                status: "FAILED",
                errorMessage: normalizedError,
                completedAt: now,
            })
            .where(
                and(
                    eq(imageAnalysisRuns.jobId, job.id),
                    eq(imageAnalysisRuns.listingImageId, image.id),
                    eq(imageAnalysisRuns.status, "RUNNING"),
                ),
            );

        /*
         * 7. Update the job.
         */
        const [updatedJob] = await tx
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
                    : now,
                lastError: normalizedError,
                updatedAt: now,
            })
            .where(
                and(
                    eq(imageAnalysisJobs.id, job.id),
                    eq(imageAnalysisJobs.status, "PROCESSING"),
                    eq(imageAnalysisJobs.lockedBy, workerId),
                    gt(imageAnalysisJobs.lockedAt, validLockAfter),
                ),
            )
            .returning();

        if (!updatedJob) {
            throw new Error(
                "Failed to update image analysis job failure state.",
            );
        }

        /*
         * 8. Retryable failure:
         * Keep the image PENDING and return the queued job.
         */
        if (hasAttemptsRemaining) {
            return mapJob(updatedJob);
        }

        /*
         * 9. Terminal failure:
         * Synchronize the image's public-facing status.
         */
        const [failedImage] = await tx
            .update(listingImages)
            .set({
                imageCheckStatus: "FAILED",
                imageCheckSource: "AUTOMATED",
                checkReason: TERMINAL_IMAGE_FAILURE_REASON,
                checkedAt: now,
            })
            .where(
                and(
                    eq(listingImages.id, image.id),
                    eq(listingImages.imageCheckStatus, "PENDING"),
                ),
            )
            .returning({
                id: listingImages.id,
            });

        if (!failedImage) {
            throw new Error(
                "Image analysis failure could not be synchronized because the image status changed.",
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
 * Jobs that have exhausted their attempts are marked FAILED,
 * along with their associated pending images and running runs.
 *
 * All database state changes occur in one transaction.
 */
export async function recoverStaleImageAnalysisJobs(): Promise<number> {
    const staleFailureReason =
        "Image analysis could not be completed because the worker stopped responding after the available attempts were exhausted.";

    return db.transaction(async (tx) => {
        const now = new Date();

        const staleBefore = new Date(
            now.getTime() - STALE_JOB_TIMEOUT_MS,
        );

        /*
         * 1. Find stale candidates without locking job rows.
         *
         * Each candidate is revalidated after its image and job
         * are locked, so an active or renewed job is not blindly
         * recovered based on this initial read.
         */
        const staleCandidates = await tx
            .select({
                id: imageAnalysisJobs.id,
                listingImageId:
                    imageAnalysisJobs.listingImageId,
            })
            .from(imageAnalysisJobs)
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
                ),
            )
            .orderBy(
                asc(imageAnalysisJobs.createdAt),
            );

        let recoveredCount = 0;

        for (const candidate of staleCandidates) {
            /*
             * 2. Lock the image first.
             */
            const images = await tx
                .select({
                    id: listingImages.id,
                    imageCheckStatus:
                        listingImages.imageCheckStatus,
                })
                .from(listingImages)
                .where(
                    eq(
                        listingImages.id,
                        candidate.listingImageId,
                    ),
                )
                .limit(1)
                .for("update");

            const image = images[0];

            if (!image) {
                /*
                 * Normally the image's cascade delete removes
                 * the associated job as well. Skip if it is gone.
                 */
                continue;
            }

            /*
             * 3. Lock the job and revalidate its stale state.
             */
            const jobs = await tx
                .select()
                .from(imageAnalysisJobs)
                .where(
                    and(
                        eq(
                            imageAnalysisJobs.id,
                            candidate.id,
                        ),
                        eq(
                            imageAnalysisJobs.listingImageId,
                            image.id,
                        ),
                        eq(
                            imageAnalysisJobs.status,
                            "PROCESSING",
                        ),
                        lte(
                            imageAnalysisJobs.lockedAt,
                            staleBefore,
                        ),
                    ),
                )
                .limit(1)
                .for("update");

            const job = jobs[0];

            /*
             * Another worker may have renewed, completed,
             * cancelled, or recovered the job already.
             */
            if (!job) {
                continue;
            }

            /*
             * If the image is no longer awaiting automated
             * analysis, cancel the stale job instead of allowing
             * it to affect the existing decision.
             */
            if (image.imageCheckStatus !== "PENDING") {
                const cancelledJobs = await tx
                    .update(imageAnalysisJobs)
                    .set({
                        status: "CANCELLED",
                        lockedAt: null,
                        lockedBy: null,
                        updatedAt: now,
                    })
                    .where(
                        and(
                            eq(
                                imageAnalysisJobs.id,
                                job.id,
                            ),
                            eq(
                                imageAnalysisJobs.status,
                                "PROCESSING",
                            ),
                        ),
                    )
                    .returning({
                        id: imageAnalysisJobs.id,
                    });

                if (cancelledJobs[0]) {
                    await tx
                        .update(imageAnalysisRuns)
                        .set({
                            status: "CANCELLED",
                            errorMessage:
                                "The image no longer requires automated analysis.",
                            completedAt: now,
                        })
                        .where(
                            and(
                                eq(
                                    imageAnalysisRuns.jobId,
                                    job.id,
                                ),
                                eq(
                                    imageAnalysisRuns.listingImageId,
                                    image.id,
                                ),
                                eq(
                                    imageAnalysisRuns.status,
                                    "RUNNING",
                                ),
                            ),
                        );

                    recoveredCount += 1;
                }

                continue;
            }

            /*
             * 4. Requeue jobs with attempts remaining.
             */
            if (job.attempts < job.maxAttempts) {
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
                                imageAnalysisJobs.id,
                                job.id,
                            ),
                            eq(
                                imageAnalysisJobs.status,
                                "PROCESSING",
                            ),
                            lte(
                                imageAnalysisJobs.lockedAt,
                                staleBefore,
                            ),
                        ),
                    )
                    .returning({
                        id: imageAnalysisJobs.id,
                    });

                if (!requeuedJobs[0]) {
                    continue;
                }

                /*
                * Close the abandoned run for this attempt.
                * The next attempt will create a new analysis run.
                */
                await tx
                    .update(imageAnalysisRuns)
                    .set({
                        status: "FAILED",
                        errorMessage:
                            "Image analysis worker stopped responding before the attempt completed.",
                        completedAt: now,
                    })
                    .where(
                        and(
                            eq(imageAnalysisRuns.jobId, job.id),
                            eq(imageAnalysisRuns.listingImageId, image.id),
                            eq(imageAnalysisRuns.status, "RUNNING"),
                        ),
                    );


                recoveredCount += 1;
                continue;
            }

            /*
             * 5. Attempts exhausted: mark the job FAILED.
             */
            const failedJobs = await tx
                .update(imageAnalysisJobs)
                .set({
                    status: "FAILED",
                    lockedAt: null,
                    lockedBy: null,
                    failedAt: now,
                    lastError: staleFailureReason,
                    updatedAt: now,
                })
                .where(
                    and(
                        eq(
                            imageAnalysisJobs.id,
                            job.id,
                        ),
                        eq(
                            imageAnalysisJobs.status,
                            "PROCESSING",
                        ),
                        lte(
                            imageAnalysisJobs.lockedAt,
                            staleBefore,
                        ),
                    ),
                )
                .returning({
                    id: imageAnalysisJobs.id,
                });

            if (!failedJobs[0]) {
                continue;
            }

            /*
             * 6. Synchronize the image, preserving the PENDING
             * guard so an existing decision is not overwritten.
             */
            const failedImages = await tx
                .update(listingImages)
                .set({
                    imageCheckStatus: "FAILED",
                    imageCheckSource: "AUTOMATED",
                    checkReason: TERMINAL_IMAGE_FAILURE_REASON,
                    checkedAt: now,
                })
                .where(
                    and(
                        eq(
                            listingImages.id,
                            image.id,
                        ),
                        eq(
                            listingImages.imageCheckStatus,
                            "PENDING",
                        ),
                    ),
                )
                .returning({
                    id: listingImages.id,
                });

            if (!failedImages[0]) {
                /*
                 * Throwing rolls back the job update as well.
                 * Do not leave a terminal job with an image
                 * that failed to synchronize.
                 */
                throw new Error(
                    "Stale image analysis failure could not be synchronized with its listing image.",
                );
            }

            /*
             * 7. Fail any run still associated with this job.
             */
            await tx
                .update(imageAnalysisRuns)
                .set({
                    status: "FAILED",
                    errorMessage: staleFailureReason,
                    completedAt: now,
                })
                .where(
                    and(
                        eq(
                            imageAnalysisRuns.jobId,
                            job.id,
                        ),
                        eq(
                            imageAnalysisRuns.listingImageId,
                            image.id,
                        ),
                        eq(
                            imageAnalysisRuns.status,
                            "RUNNING",
                        ),
                    ),
                );

            recoveredCount += 1;
        }

        return recoveredCount;
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

/**

* Renews a processing job's lease.
*
* A worker may renew the lease only while the job is PROCESSING
* and remains assigned to that worker.
*
* Returns false if the worker no longer owns the job.
  */
  export async function renewImageAnalysisJobLease(
    jobId: string,
    workerId: string,
): Promise<boolean> {
    const now = new Date();

    const renewedJobs = await db
        .update(imageAnalysisJobs)
        .set({
            lockedAt: now,
            updatedAt: now,
        })
        .where(
            and(
            eq(imageAnalysisJobs.id, jobId),
            eq(imageAnalysisJobs.status, "PROCESSING"),
            eq(imageAnalysisJobs.lockedBy, workerId),
        ),
    )
    .returning({
        id: imageAnalysisJobs.id,
    });

    return renewedJobs.length > 0;
}
