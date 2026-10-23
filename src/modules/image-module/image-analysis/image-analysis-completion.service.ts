import {
    and,
    eq,
    gt,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    imageAnalysisJobs,
    imageAnalysisRuns,
    listingImages,
} from "../../../database/schema/index.ts";

import type {
    CompleteImageAnalysisRunInput,
} from "./image-analysis.types.ts";

interface CompleteImageAnalysisJobInput {
    jobId: string;
    workerId: string;
    runId: string;
    listingImageId: string;

    analysis: CompleteImageAnalysisRunInput & {
        sha256: string;
        perceptualHash: string;
        similarityScore: string | null;
        matchedImageId: string | null;
        matchedListingId: string | null;
    };
}

const STALE_JOB_TIMEOUT_MS = 10 * 60 * 1000;

export async function completeImageAnalysisSuccessfully(
    input: CompleteImageAnalysisJobInput,
): Promise<void> {
    await db.transaction(async (tx) => {
        const now = new Date();

        const validLockAfter = new Date(
            now.getTime() - STALE_JOB_TIMEOUT_MS,
        );

        /*
         * 1. Lock the listing image FIRST.
         *
         * This follows the locking order used by enqueue and
         * administrator review.
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
                    input.listingImageId,
                ),
            )
            .limit(1)
            .for("update");

        const image = images[0];

        if (!image) {
            throw new Error(
                "Cannot complete image analysis: the listing image no longer exists.",
            );
        }

        /*
         * 2. Lock the job SECOND and verify worker ownership.
         */
        const ownedJobs = await tx
            .select({
                id: imageAnalysisJobs.id,
                analysisRunId:
                    imageAnalysisJobs.analysisRunId,
                lockedAt: imageAnalysisJobs.lockedAt,
            })
            .from(imageAnalysisJobs)
            .where(
                and(
                    eq(
                        imageAnalysisJobs.id,
                        input.jobId,
                    ),
                    eq(
                        imageAnalysisJobs.listingImageId,
                        input.listingImageId,
                    ),
                    eq(
                        imageAnalysisJobs.status,
                        "PROCESSING",
                    ),
                    eq(
                        imageAnalysisJobs.lockedBy,
                        input.workerId,
                    ),
                    gt(
                        imageAnalysisJobs.lockedAt,
                        validLockAfter,
                    ),
                ),
            )
            .limit(1)
            .for("update");

        const ownedJob = ownedJobs[0];

        if (!ownedJob) {
            throw new Error(
                "Cannot complete image analysis: the job is no longer owned by this worker or its lease has expired.",
            );
        }

        /*
         * 3. Verify that this job still references the run
         * being completed.
         */
        if (
            ownedJob.analysisRunId !== input.runId
        ) {
            throw new Error(
                "Cannot complete image analysis: the run does not match the job's current analysis run.",
            );
        }

        /*
         * 4. Protect existing decisions.
         *
         * An administrator may have approved, rejected, or
         * flagged this image while the worker was processing it.
         */
        if (
            image.imageCheckStatus !== "PENDING"
        ) {
            throw new Error(
                "Cannot complete image analysis: the image is no longer awaiting automated analysis.",
            );
        }

        /*
         * 5. Complete only the matching RUNNING analysis run.
         */
        const completedRuns = await tx
            .update(imageAnalysisRuns)
            .set({
                status: "COMPLETED",

                decision: input.analysis.decision,

                ...(input.analysis.confidence !== undefined
                    ? {
                        confidence:
                            input.analysis.confidence,
                    }
                    : {}),

                ...(input.analysis.decisionReason !== undefined
                    ? {
                        decisionReason:
                            input.analysis.decisionReason,
                    }
                    : {}),

                completedAt: now,
            })
            .where(
                and(
                    eq(
                        imageAnalysisRuns.id,
                        input.runId,
                    ),
                    eq(
                        imageAnalysisRuns.jobId,
                        input.jobId,
                    ),
                    eq(
                        imageAnalysisRuns.listingImageId,
                        input.listingImageId,
                    ),
                    eq(
                        imageAnalysisRuns.status,
                        "RUNNING",
                    ),
                ),
            )
            .returning({
                id: imageAnalysisRuns.id,
            });

        if (!completedRuns[0]) {
            throw new Error(
                "Cannot complete image analysis: the run is no longer running or does not belong to this job and image.",
            );
        }

        /*
         * 6. Persist the automated decision.
         *
         * The image row is already locked, and its status was
         * verified above.
         */
        const updatedImages = await tx
            .update(listingImages)
            .set({
                sha256: input.analysis.sha256,

                perceptualHash:
                    input.analysis.perceptualHash,

                imageCheckStatus:
                    input.analysis.decision === "PASSED"
                        ? "PASSED"
                        : input.analysis.decision === "REVIEW"
                            ? "REVIEW"
                            : "FAILED",
                        
                imageCheckSource: "AUTOMATED",

                similarityScore:
                    input.analysis.similarityScore,

                matchedImageId:
                    input.analysis.matchedImageId,

                matchedListingId:
                    input.analysis.matchedListingId,

                checkReason:
                    input.analysis.decisionReason ?? null,

                checkedAt: now,
            })
            .where(
                and(
                    eq(
                        listingImages.id,
                        input.listingImageId,
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

        if (!updatedImages[0]) {
            throw new Error(
                "Cannot complete image analysis: the image status changed during completion.",
            );
        }

        /*
         * 7. Complete the job.
         *
         * Revalidate ownership and lease before committing.
         */
        const completedJobs = await tx
            .update(imageAnalysisJobs)
            .set({
                status: "COMPLETED",
                completedAt: now,
                lockedAt: null,
                lockedBy: null,
                updatedAt: now,
            })
            .where(
                and(
                    eq(
                        imageAnalysisJobs.id,
                        input.jobId,
                    ),
                    eq(
                        imageAnalysisJobs.listingImageId,
                        input.listingImageId,
                    ),
                    eq(
                        imageAnalysisJobs.status,
                        "PROCESSING",
                    ),
                    eq(
                        imageAnalysisJobs.lockedBy,
                        input.workerId,
                    ),
                    gt(
                        imageAnalysisJobs.lockedAt,
                        validLockAfter,
                    ),
                ),
            )
            .returning({
                id: imageAnalysisJobs.id,
            });

        if (!completedJobs[0]) {
            throw new Error(
                "Cannot complete image analysis: job ownership changed or the lease expired.",
            );
        }
    });
}