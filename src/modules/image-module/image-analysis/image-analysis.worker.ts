import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "../../../database/index.ts";

import {
    listingImages,
} from "../../../database/schema/index.ts";

import {
    getObjectStorage,
} from "../../../infrastructure/storage/object-storage.ts";

import {
    analyzeImage,
} from "../image-intelligence/image-intelligence.service.ts";

import {
    claimNextImageAnalysisJob,
    completeImageAnalysisJob,
    failImageAnalysisJob,
    recoverStaleImageAnalysisJobs,
} from "./image-analysis-job.service.ts";

import {
    completeImageAnalysisRun,
    createImageAnalysisRun,
    failImageAnalysisRun,
} from "./image-analysis-run.service.ts";

const WORKER_POLL_INTERVAL_MS = 2_000;

const WORKER_RECOVERY_INTERVAL_MS = 60_000;

const WORKER_ID =
    `image-analysis-worker-${randomUUID()}`;

let stopping = false;

let recoveryTimer:
    NodeJS.Timeout | undefined;

function sleep(
    milliseconds: number,
): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}

async function recoverStaleJobs(): Promise<void> {
    try {
        const recovered =
            await recoverStaleImageAnalysisJobs();

        if (recovered > 0) {
            console.log(
                `[${WORKER_ID}] Recovered ${recovered} stale image-analysis job(s).`,
            );
        }
    } catch (error: unknown) {
        console.error(
            `[${WORKER_ID}] Failed to recover stale jobs.`,
            error,
        );
    }
}

async function processJob(
    job: Awaited<
        ReturnType<
            typeof claimNextImageAnalysisJob
        >
    >,
): Promise<void> {
    if (!job) {
        return;
    }

    console.log(
        `[${WORKER_ID}] Processing job ${job.id} for image ${job.listingImageId}.`,
    );

    let runId: string | null = null;

    try {
        const images = await db
            .select()
            .from(listingImages)
            .where(
                eq(
                    listingImages.id,
                    job.listingImageId,
                ),
            )
            .limit(1);

        const listingImage = images[0];

        if (!listingImage) {
            throw new Error(
                `Listing image ${job.listingImageId} no longer exists.`,
            );
        }

        const run =
            await createImageAnalysisRun({
                listingImageId:
                    listingImage.id,
                jobId: job.id,
                provider: "karmass",
                providerVersion: "1.0.0",
                pipelineVersion: "1.0.0",
            });

        runId = run.id;

        const storage =
            getObjectStorage();

        const imageBuffer =
            await storage.get(
                listingImage.objectKey,
                {
                    resourceType: "image",
                    access: "public",
                },
            );

        const analysis =
            await analyzeImage(
                imageBuffer,
                listingImage.listingId,
                listingImage.id,
                run.id,
            );

        await db
            .update(listingImages)
            .set({
                sha256:
                    analysis.sha256,
                perceptualHash:
                    analysis.perceptualHash,
                imageCheckStatus:
                    analysis.decision === "PASSED"
                        ? "PASSED"
                        : analysis.decision === "REVIEW"
                            ? "REVIEW"
                            : "FAILED",
                similarityScore:
                    analysis.similarityScore,
                matchedImageId:
                    analysis.matchedImageId,
                matchedListingId:
                    analysis.matchedListingId,
                checkReason:
                    analysis.reason,
                checkedAt: new Date(),
            })
            .where(
                eq(
                    listingImages.id,
                    listingImage.id,
                ),
            );

        await completeImageAnalysisRun(
            run.id,
            {
                decision:
                    analysis.decision,
                confidence:
                    analysis.confidence,
                decisionReason:
                    analysis.reason,
            },
        );

        await completeImageAnalysisJob(
            job.id,
            WORKER_ID,
        );

        console.log(
            `[${WORKER_ID}] Completed job ${job.id} with decision ${analysis.decision}.`,
        );
    } catch (error: unknown) {
        const message =
            error instanceof Error
                ? error.message
                : "Unknown image analysis error.";

        console.error(
            `[${WORKER_ID}] Job ${job.id} failed: ${message}`,
        );

        if (runId) {
            try {
                await failImageAnalysisRun(
                    runId,
                    message,
                );
            } catch (
                runFailureError: unknown
            ) {
                console.error(
                    `[${WORKER_ID}] Failed to persist analysis-run failure.`,
                    runFailureError,
                );
            }
        }

        try {
            const failedJob =
                await failImageAnalysisJob(
                    job.id,
                    WORKER_ID,
                    message,
                );

            console.log(
                `[${WORKER_ID}] Job ${job.id} is now ${failedJob.status}. Attempts: ${failedJob.attempts}/${failedJob.maxAttempts}.`,
            );
        } catch (
            failureError: unknown
        ) {
            console.error(
                `[${WORKER_ID}] Failed to persist job failure state.`,
                failureError,
            );
        }
    }
}

async function workerLoop(): Promise<void> {
    console.log(
        `[${WORKER_ID}] Image analysis worker started.`,
    );

    while (!stopping) {
        try {
            const job =
                await claimNextImageAnalysisJob(
                    WORKER_ID,
                );

            if (!job) {
                await sleep(
                    WORKER_POLL_INTERVAL_MS,
                );

                continue;
            }

            await processJob(job);
        } catch (error: unknown) {
            console.error(
                `[${WORKER_ID}] Worker loop error.`,
                error,
            );

            await sleep(
                WORKER_POLL_INTERVAL_MS,
            );
        }
    }

    console.log(
        `[${WORKER_ID}] Worker stopped.`,
    );
}

function startRecoveryTimer(): void {
    recoveryTimer = setInterval(
        () => {
            void recoverStaleJobs();
        },
        WORKER_RECOVERY_INTERVAL_MS,
    );
}

function stopRecoveryTimer(): void {
    if (!recoveryTimer) {
        return;
    }

    clearInterval(recoveryTimer);
    recoveryTimer = undefined;
}

function registerShutdownHandlers(): void {
    const shutdown = (
        signal: string,
    ): void => {
        if (stopping) {
            return;
        }

        console.log(
            `[${WORKER_ID}] Received ${signal}. Shutting down...`,
        );

        stopping = true;

        stopRecoveryTimer();
    };

    process.once(
        "SIGINT",
        () => shutdown("SIGINT"),
    );

    process.once(
        "SIGTERM",
        () => shutdown("SIGTERM"),
    );
}

export async function startImageAnalysisWorker(): Promise<void> {
    registerShutdownHandlers();

    await recoverStaleJobs();

    startRecoveryTimer();

    await workerLoop();
}