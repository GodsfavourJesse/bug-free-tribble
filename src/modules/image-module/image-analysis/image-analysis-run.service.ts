import {
    and,
    eq,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    imageAnalysisJobs,
    imageAnalysisResults,
    imageAnalysisRuns,
    listingImages,
} from "../../../database/schema/index.ts";
import { CompleteImageAnalysisRunInput, CreateImageAnalysisResultInput, CreateImageAnalysisRunInput, ImageAnalysisRun } from "./image-analysis.types.ts";


function mapRun(
    run: typeof imageAnalysisRuns.$inferSelect,
): ImageAnalysisRun {
    return {
        id: run.id,
        listingImageId: run.listingImageId,
        jobId: run.jobId,
        status: run.status,
        provider: run.provider,
        providerVersion: run.providerVersion,
        pipelineVersion: run.pipelineVersion,
        modelVersion: run.modelVersion,
        decision: run.decision,
        confidence: run.confidence,
        decisionReason: run.decisionReason,
        errorMessage: run.errorMessage,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        createdAt: run.createdAt,
    };
}

export async function createImageAnalysisRun(
    input: CreateImageAnalysisRunInput & {
        workerId: string;
    },
): Promise<ImageAnalysisRun> {
    const provider = input.provider ?? "karmass";
    const pipelineVersion = input.pipelineVersion ?? "1.0.0";

    return db.transaction(async (tx) => {
        /*
         * 1. Read the job without locking it.
         * This gives us the image ID so we can follow the
         * consistent image-first locking order.
         */
        const [jobReference] = await tx
            .select({
                id: imageAnalysisJobs.id,
                listingImageId: imageAnalysisJobs.listingImageId,
            })
            .from(imageAnalysisJobs)
            .where(
                and(
                    eq(imageAnalysisJobs.id, input.jobId),
                    eq(
                        imageAnalysisJobs.listingImageId,
                        input.listingImageId,
                    ),
                ),
            )
            .limit(1);

        if (!jobReference) {
            throw new Error(
                "Cannot create image analysis run: job not found.",
            );
        }

        /*
         * 2. Lock the listing image first.
         */
        const [listingImage] = await tx
            .select({
                id: listingImages.id,
                imageCheckStatus: listingImages.imageCheckStatus,
            })
            .from(listingImages)
            .where(eq(listingImages.id, jobReference.listingImageId))
            .limit(1)
            .for("update");

        if (!listingImage) {
            throw new Error(
                "Cannot create image analysis run: listing image not found.",
            );
        }

        /*
         * Do not start AI analysis if the image has already
         * received a decision.
         */
        if (listingImage.imageCheckStatus !== "PENDING") {
            throw new Error(
                "Cannot create image analysis run: image is no longer pending analysis.",
            );
        }

        /*
         * 3. Lock and validate the job after locking the image.
         */
        const [job] = await tx
            .select({
                id: imageAnalysisJobs.id,
                listingImageId: imageAnalysisJobs.listingImageId,
                analysisRunId: imageAnalysisJobs.analysisRunId,
                lockedAt: imageAnalysisJobs.lockedAt,
            })
            .from(imageAnalysisJobs)
            .where(
                and(
                    eq(imageAnalysisJobs.id, input.jobId),
                    eq(
                        imageAnalysisJobs.listingImageId,
                        input.listingImageId,
                    ),
                    eq(
                        imageAnalysisJobs.lockedBy,
                        input.workerId,
                    ),
                    eq(imageAnalysisJobs.status, "PROCESSING"),
                ),
            )
            .limit(1)
            .for("update");

        if (!job) {
            throw new Error(
                "Cannot create image analysis run: job is not processing or is not owned by this worker.",
            );
        }

        /*
         * 4. Validate the worker lease.
         *
         * Keep this timeout consistent with the timeout used
         * by the job service's lease validation.
         */
        const LEASE_TIMEOUT_MS = 10 * 60 * 1000;
        const now = new Date();

        if (
            !job.lockedAt ||
            job.lockedAt.getTime() <= now.getTime() - LEASE_TIMEOUT_MS
        ) {
            throw new Error(
                "Cannot create image analysis run: worker lease has expired.",
            );
        }

        /*
         * 5. Reuse an existing RUNNING run if this job still
         * references one for the same image.
         */
        if (job.analysisRunId) {
            const [existingRun] = await tx
                .select()
                .from(imageAnalysisRuns)
                .where(
                    and(
                        eq(imageAnalysisRuns.id, job.analysisRunId),
                        eq(imageAnalysisRuns.jobId, job.id),
                        eq(
                            imageAnalysisRuns.listingImageId,
                            job.listingImageId,
                        ),
                        eq(imageAnalysisRuns.status, "RUNNING"),
                    ),
                )
                .limit(1);

            if (existingRun) {
                return mapRun(existingRun);
            }
        }

        /*
         * 6. Create the new run.
         */
        const [insertedRun] = await tx
            .insert(imageAnalysisRuns)
            .values({
                listingImageId: input.listingImageId,
                jobId: input.jobId,
                status: "RUNNING",
                provider,
                ...(input.providerVersion
                    ? { providerVersion: input.providerVersion }
                    : {}),
                pipelineVersion,
                ...(input.modelVersion
                    ? { modelVersion: input.modelVersion }
                    : {}),
            })
            .returning();

        if (!insertedRun) {
            throw new Error("Failed to create image analysis run.");
        }

        /*
         * 7. Associate the new run with the job.
         */
        const [updatedJob] = await tx
            .update(imageAnalysisJobs)
            .set({
                analysisRunId: insertedRun.id,
                updatedAt: now,
            })
            .where(
                and(
                    eq(imageAnalysisJobs.id, job.id),
                    eq(imageAnalysisJobs.status, "PROCESSING"),
                    eq(imageAnalysisJobs.lockedBy, input.workerId),
                ),
            )
            .returning({
                id: imageAnalysisJobs.id,
            });

        if (!updatedJob) {
            throw new Error(
                "Failed to associate the analysis run with its job.",
            );
        }

        return mapRun(insertedRun);
    });
}

export async function saveImageAnalysisResult(
    input: CreateImageAnalysisResultInput,
): Promise<string> {
    const insertedResults = await db
        .insert(imageAnalysisResults)
        .values({
            runId: input.runId,
            listingImageId: input.listingImageId,
            resultType: input.resultType,
            provider: input.provider,
            ...(input.providerVersion
                ? {
                    providerVersion:
                        input.providerVersion,
                }
                : {}),
            ...(input.modelVersion
                ? {
                    modelVersion:
                        input.modelVersion,
                }
                : {}),
            ...(input.confidence !== undefined
                ? {
                    confidence:
                        input.confidence,
                }
                : {}),
            ...(input.score !== undefined
                ? {
                    score: input.score,
                }
                : {}),
            ...(input.passed !== undefined
                ? {
                    passed: input.passed,
                }
                : {}),
            ...(input.data !== undefined
                ? {
                    data: input.data,
                }
                : {}),
            ...(input.reason
                ? {
                    reason: input.reason,
                }
                : {}),
        })
        .returning({
            id: imageAnalysisResults.id,
        });

    const insertedResult = insertedResults[0];

    if (!insertedResult) {
        throw new Error(
            "Failed to save image analysis result.",
        );
    }

    return insertedResult.id;
}

export async function saveImageAnalysisResultForWorker(
    input: CreateImageAnalysisResultInput & {
        jobId: string;
        workerId: string;
    },
): Promise<string> {
    return db.transaction(async (tx) => {
        const [job] = await tx
            .select({
                id: imageAnalysisJobs.id,
                listingImageId:
                    imageAnalysisJobs.listingImageId,
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
                ),
            )
            .limit(1)
            .for("update");

        if (!job) {
            throw new Error(
                "Cannot save image analysis result: worker no longer owns the job.",
            );
        }

        const [run] = await tx
            .select({
                id: imageAnalysisRuns.id,
            })
            .from(imageAnalysisRuns)
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
            .limit(1);

        if (!run) {
            throw new Error(
                "Cannot save image analysis result: analysis run is not RUNNING or does not match the job.",
            );
        }

        const [insertedResult] = await tx
            .insert(imageAnalysisResults)
            .values({
                runId: input.runId,
                listingImageId: input.listingImageId,
                resultType: input.resultType,
                provider: input.provider,
                ...(input.providerVersion
                    ? {
                        providerVersion:
                            input.providerVersion,
                    }
                    : {}),
                ...(input.modelVersion
                    ? {
                        modelVersion:
                            input.modelVersion,
                    }
                    : {}),
                ...(input.confidence !== undefined
                    ? {
                        confidence:
                            input.confidence,
                    }
                    : {}),
                ...(input.score !== undefined
                    ? {
                        score: input.score,
                    }
                    : {}),
                ...(input.passed !== undefined
                    ? {
                        passed: input.passed,
                    }
                    : {}),
                ...(input.data !== undefined
                    ? {
                        data: input.data,
                    }
                    : {}),
                ...(input.reason
                    ? {
                        reason: input.reason,
                    }
                    : {}),
            })
            .returning({
                id: imageAnalysisResults.id,
            });

        if (!insertedResult) {
            throw new Error(
                "Failed to save image analysis result.",
            );
        }

        return insertedResult.id;
    });
}

export async function saveImageAnalysisResultsForWorker(
    inputs: (CreateImageAnalysisResultInput & {
        jobId: string;
        workerId: string;
    })[],
): Promise<string[]> {
    if (inputs.length === 0) {
        return [];
    }

    const first = inputs[0];

    if (!first) {
        throw new Error(
            "At least one image analysis result is required.",
        );
    }

    return db.transaction(async (tx) => {
        const [job] = await tx
            .select({
                id: imageAnalysisJobs.id,
                listingImageId:
                    imageAnalysisJobs.listingImageId,
            })
            .from(imageAnalysisJobs)
            .where(
                and(
                    eq(
                        imageAnalysisJobs.id,
                        first.jobId,
                    ),
                    eq(
                        imageAnalysisJobs.listingImageId,
                        first.listingImageId,
                    ),
                    eq(
                        imageAnalysisJobs.status,
                        "PROCESSING",
                    ),
                    eq(
                        imageAnalysisJobs.lockedBy,
                        first.workerId,
                    ),
                ),
            )
            .limit(1)
            .for("update");

        if (!job) {
            throw new Error(
                "Cannot save image analysis results: worker no longer owns the job.",
            );
        }

        for (const input of inputs) {
            if (
                input.jobId !== first.jobId ||
                input.workerId !== first.workerId ||
                input.runId !== first.runId ||
                input.listingImageId !== first.listingImageId
            ) {
                throw new Error(
                    "All results in a batch must belong to the same job, worker, run, and image.",
                );
            }
        }

        const [run] = await tx
            .select({
                id: imageAnalysisRuns.id,
            })
            .from(imageAnalysisRuns)
            .where(
                and(
                    eq(
                        imageAnalysisRuns.id,
                        first.runId,
                    ),
                    eq(
                        imageAnalysisRuns.jobId,
                        first.jobId,
                    ),
                    eq(
                        imageAnalysisRuns.listingImageId,
                        first.listingImageId,
                    ),
                    eq(
                        imageAnalysisRuns.status,
                        "RUNNING",
                    ),
                ),
            )
            .limit(1);

        if (!run) {
            throw new Error(
                "Cannot save image analysis results: run is not RUNNING or does not match the job.",
            );
        }

        const insertedResults = await tx
            .insert(imageAnalysisResults)
            .values(
                inputs.map((input) => ({
                    runId: input.runId,
                    listingImageId: input.listingImageId,
                    resultType: input.resultType,
                    provider: input.provider,
                    ...(input.providerVersion
                        ? {
                            providerVersion:
                                input.providerVersion,
                        }
                        : {}),
                    ...(input.modelVersion
                        ? {
                            modelVersion:
                                input.modelVersion,
                        }
                        : {}),
                    ...(input.confidence !== undefined
                        ? {
                            confidence: input.confidence,
                        }
                        : {}),
                    ...(input.score !== undefined
                        ? {
                            score: input.score,
                        }
                        : {}),
                    ...(input.passed !== undefined
                        ? {
                            passed: input.passed,
                        }
                        : {}),
                    ...(input.data !== undefined
                        ? {
                            data: input.data,
                        }
                        : {}),
                    ...(input.reason
                        ? {
                            reason: input.reason,
                        }
                        : {}),
                })),
            )
            .returning({
                id: imageAnalysisResults.id,
            });

        if (insertedResults.length !== inputs.length) {
            throw new Error(
                "Not all image analysis results were saved.",
            );
        }

        return insertedResults.map((result) => result.id);
    });
}

export async function completeImageAnalysisRun(
    runId: string,
    input: CompleteImageAnalysisRunInput,
): Promise<ImageAnalysisRun> {
    const updatedRuns = await db
        .update(imageAnalysisRuns)
        .set({
            status: "COMPLETED",
            decision: input.decision,
            ...(input.confidence !== undefined
                ? {
                    confidence:
                        input.confidence,
                }
                : {}),
            ...(input.decisionReason
                ? {
                    decisionReason:
                        input.decisionReason,
                }
                : {}),
            completedAt: new Date(),
        })
        .where(
            and(
                eq(
                    imageAnalysisRuns.id,
                    runId,
                ),
                eq(
                    imageAnalysisRuns.status,
                    "RUNNING",
                ),
            ),
        )
        .returning();

    const updatedRun = updatedRuns[0];

    if (!updatedRun) {
        throw new Error(
            "Image analysis run could not be completed because it is no longer running.",
        );
    }

    return mapRun(updatedRun);
}

export async function failImageAnalysisRun(
    runId: string,
    errorMessage: string,
): Promise<ImageAnalysisRun> {
    const normalizedError =
        errorMessage.trim() ||
        "Image analysis run failed.";

    const updatedRuns = await db
        .update(imageAnalysisRuns)
        .set({
            status: "FAILED",
            errorMessage: normalizedError,
            completedAt: new Date(),
        })
        .where(
            and(
                eq(
                    imageAnalysisRuns.id,
                    runId,
                ),
                eq(
                    imageAnalysisRuns.status,
                    "RUNNING",
                ),
            ),
        )
        .returning();

    const updatedRun = updatedRuns[0];

    if (!updatedRun) {
        throw new Error(
            "Image analysis run could not be failed because it is no longer running.",
        );
    }

    return mapRun(updatedRun);
}

export async function failImageAnalysisRunForWorker(
    runId: string,
    jobId: string,
    workerId: string,
    errorMessage: string,
) {
    return db.transaction(async (tx) => {
        // Verify that this worker still owns the processing job.
        const [job] = await tx
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
                ),
            )
            .limit(1)
            .for("update");

        if (!job) {
            throw new Error(
                "Cannot fail image analysis run: worker no longer owns the job.",
            );
        }

        const [failedRun] = await tx
            .update(imageAnalysisRuns)
            .set({
                status: "FAILED",
                errorMessage,
                completedAt: new Date(),
            })
            .where(
                and(
                    eq(imageAnalysisRuns.id, runId),
                    eq(imageAnalysisRuns.jobId, jobId),
                    eq(
                        imageAnalysisRuns.listingImageId,
                        job.listingImageId,
                    ),
                    eq(imageAnalysisRuns.status, "RUNNING"),
                ),
            )
            .returning();

        if (!failedRun) {
            throw new Error(
                "Cannot fail image analysis run: run not found or no longer RUNNING.",
            );
        }

        return mapRun(failedRun);
    });
}

export async function cancelImageAnalysisRun(
    runId: string,
): Promise<ImageAnalysisRun> {
    const updatedRuns = await db
        .update(imageAnalysisRuns)
        .set({
            status: "CANCELLED",
            completedAt: new Date(),
        })
        .where(
            and(
                eq(
                    imageAnalysisRuns.id,
                    runId,
                ),
                eq(
                    imageAnalysisRuns.status,
                    "RUNNING",
                ),
            ),
        )
        .returning();

    const updatedRun = updatedRuns[0];

    if (!updatedRun) {
        throw new Error(
            "Image analysis run could not be cancelled because it is no longer running.",
        );
    }

    return mapRun(updatedRun);
}