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
    failImageAnalysisJob,
    recoverStaleImageAnalysisJobs,
    renewImageAnalysisJobLease,
} from "./image-analysis-job.service.ts";

import {
    createImageAnalysisRun,
} from "./image-analysis-run.service.ts";

import {
    completeImageAnalysisSuccessfully,
} from "./image-analysis-completion.service.ts";
import { ClaimedImageAnalysisJob } from "../../../jobs/jobs.types.ts";

const WORKER_POLL_INTERVAL_MS = 2_000;
const WORKER_RECOVERY_INTERVAL_MS = 60_000;
const JOB_HEARTBEAT_INTERVAL_MS = 60_000;

const WORKER_ID = `image-analysis-worker-${randomUUID()}`;

let stopping = false;
let recoveryTimer: NodeJS.Timeout | undefined;


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
    job: ClaimedImageAnalysisJob | null,
): Promise<void> {
    if (!job) {
        return;
    }

    let runId: string | undefined;
    let leaseLost = false;
    let heartbeatRunning = false;

    const heartbeatTimer = setInterval(() => {
        if (heartbeatRunning || leaseLost) {
            return;
        }

        heartbeatRunning = true;

        void renewImageAnalysisJobLease(
            job.id,
            WORKER_ID,
        )
            .then((renewed) => {
                if (!renewed) {
                    leaseLost = true;

                    console.error(
                        `[ImageAnalysisWorker] Lost job lease: ${job.id}`,
                    );
                }
            })
            .catch((error: unknown) => {
                console.error(
                    `[ImageAnalysisWorker] Failed to renew lease for job ${job.id}:`,
                    error,
                );
            })
            .finally(() => {
                heartbeatRunning = false;
            });
    }, JOB_HEARTBEAT_INTERVAL_MS);

    heartbeatTimer.unref();

    try {
        const [listingImage] = await db
            .select()
            .from(listingImages)
            .where(
                eq(
                    listingImages.id,
                    job.listingImageId,
                ),
            )
            .limit(1);

        if (!listingImage) {
            throw new Error(
                `Listing image not found: ${job.listingImageId}`,
            );
        }

        const run = await createImageAnalysisRun({
            listingImageId: listingImage.id,
            jobId: job.id,
            workerId: WORKER_ID,
            provider: "karmass",
            providerVersion: "1.0.0",
            pipelineVersion: "1.0.0",
        });

        runId = run.id;

        const storage = getObjectStorage();

        const imageBuffer = await storage.get(
            listingImage.objectKey,
            {
                resourceType: "image",
                access: "public",
            },
        );

        const analysis = await analyzeImage(
            imageBuffer,
            listingImage.listingId,
            listingImage.id,
            run.id,
            {
                jobId: job.id,
                workerId: WORKER_ID,
            }
        );

        if (leaseLost) {
            console.warn(
                `[ImageAnalysisWorker] Skipping completion because the lease was lost: ${job.id}`,
            );

            return;
        }

        await completeImageAnalysisSuccessfully({
            jobId: job.id,
            workerId: WORKER_ID,
            runId: run.id,
            listingImageId: listingImage.id,
            analysis: {
                decision: analysis.decision,
                confidence: analysis.confidence,
                decisionReason: analysis.reason,
                sha256: analysis.sha256,
                perceptualHash: analysis.perceptualHash,
                similarityScore: analysis.similarityScore,
                matchedImageId: analysis.matchedImageId,
                matchedListingId: analysis.matchedListingId,
            },
        });
    } catch (error: unknown) {
        const message =
            error instanceof Error
                ? error.message
                : "Image analysis failed.";

        console.error(
            `[ImageAnalysisWorker] Job ${job.id} failed:`,
            message,
        );

        if (leaseLost) {
            console.warn(
                `[ImageAnalysisWorker] Skipping failure updates because the lease was lost: ${job.id}`,
            );

            return;
        }

        try {
            await failImageAnalysisJob(
                job.id,
                WORKER_ID,
                message,
            );
        } catch (jobError: unknown) {
            console.error(
                `[ImageAnalysisWorker] Failed to update job ${job.id}:`,
                jobError,
            );
        }
    } finally {
        clearInterval(heartbeatTimer);
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