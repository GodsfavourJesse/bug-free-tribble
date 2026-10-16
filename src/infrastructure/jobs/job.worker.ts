import { logger } from "../../config/logger.ts";
import {
    completeJob,
    failJob,
    newWorkerId,
    claimNextJob,
    type ClaimedJob,
    type JobType,
} from "./job.queue.ts";
import {
    executeJobHandler,
    getSupportedJobTypes,
    type JobHandlerRegistry,
} from "./job.handlers.ts";

export interface WorkerOptions {
    workerId?: string;
    handlers: JobHandlerRegistry;
    pollIntervalMs: number;
    maxBackoffMs?: number;
}

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.stack ?? error.message;
    }

    return String(error);

}

function calculateRetryDelay(
    attempts: number,
    maxBackoffMs: number,
): number {
    const exponent = Math.min(Math.max(attempts - 1, 0), 20);

    return Math.min(
        1_000 * 2 ** exponent,
        maxBackoffMs,
    );

}

function sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}

export class JobWorker {
    private readonly workerId: string;
    private readonly handlers: JobHandlerRegistry;
    private readonly supportedTypes: JobType[];
    private readonly pollIntervalMs: number;
    private readonly maxBackoffMs: number;

    private running = false;
    private stopping = false;
    private loopPromise: Promise<void> | null = null;

    constructor(options: WorkerOptions) {
        if (
            !Number.isInteger(options.pollIntervalMs)
            || options.pollIntervalMs < 100
        ) {
            throw new Error(
                "Worker poll interval must be an integer of at least 100ms.",
            );
        }

        const maxBackoffMs = options.maxBackoffMs ?? 60_000;

        if (
            !Number.isInteger(maxBackoffMs)
            || maxBackoffMs < 1_000
        ) {
            throw new Error(
                "Maximum retry backoff must be an integer of at least 1000ms.",
            );
        }

        this.workerId = options.workerId ?? newWorkerId();
        this.handlers = options.handlers;
        this.supportedTypes = getSupportedJobTypes(options.handlers);
        this.pollIntervalMs = options.pollIntervalMs;
        this.maxBackoffMs = maxBackoffMs;
    }

    start(): Promise<void> {
        if (this.running) {
            throw new Error("This worker has already been started.");
        }

        this.running = true;
        this.stopping = false;

        this.loopPromise = this.runLoop();

        return this.loopPromise;
    }

    async stop(): Promise<void> {
        if (!this.running) {
            return;
        }

        this.stopping = true;

        logger.info(
            { workerId: this.workerId },
            "Background worker shutdown requested.",
        );

        if (this.loopPromise) {
            await this.loopPromise;
        }

        this.running = false;

        logger.info(
            { workerId: this.workerId },
            "Background worker stopped.",
        );
    }

    private async runLoop(): Promise<void> {
        logger.info(
            {
                workerId: this.workerId,
                supportedTypes: this.supportedTypes,
                pollIntervalMs: this.pollIntervalMs,
            },
            "Background worker started.",
        );

        if (this.supportedTypes.length === 0) {
            logger.warn(
                { workerId: this.workerId },
                "No job handlers are registered. The worker will remain idle.",
            );
        }

        while (!this.stopping) {
            if (this.supportedTypes.length === 0) {
                await sleep(this.pollIntervalMs);
                continue;
            }

            try {
                const job = await claimNextJob(
                    this.workerId,
                    this.supportedTypes,
                );

                if (!job) {
                    await sleep(this.pollIntervalMs);
                    continue;
                }

                await this.processJob(job);
            } catch (error) {
                logger.error(
                    {
                        workerId: this.workerId,
                        error: getErrorMessage(error),
                    },
                    "Background worker encountered an error.",
                );

                if (!this.stopping) {
                    await sleep(this.pollIntervalMs);
                }
            }
        }
    }

    private async processJob(job: ClaimedJob): Promise<void> {
        logger.info(
            {
                workerId: this.workerId,
                jobId: job.id,
                type: job.type,
                attempts: job.attempts,
                maxAttempts: job.maxAttempts,
            },
            "Processing background job.",
        );

        try {
            await executeJobHandler(job, this.handlers);

            const completed = await completeJob(
                job.id,
                this.workerId,
            );

            if (!completed) {
                logger.error(
                    {
                        workerId: this.workerId,
                        jobId: job.id,
                        type: job.type,
                    },
                    "Job handler succeeded, but the worker no longer owns the job.",
                );

                return;
            }

            logger.info(
                {
                    workerId: this.workerId,
                    jobId: job.id,
                    type: job.type,
                },
                "Background job completed.",
            );
        } catch (error) {
            const errorMessage = getErrorMessage(error);
            const terminal = job.attempts >= job.maxAttempts;

            const retryDelayMs = calculateRetryDelay(
                job.attempts,
                this.maxBackoffMs,
            );

            const retryAt = new Date(
                Date.now() + retryDelayMs,
            );

            try {
                const updated = await failJob({
                    jobId: job.id,
                    workerId: this.workerId,
                    error: errorMessage,
                    terminal,
                    ...(terminal ? {} : { retryAt }),
                });

                if (!updated) {
                    logger.error(
                        {
                            workerId: this.workerId,
                            jobId: job.id,
                            type: job.type,
                        },
                        "Failed job could not be updated because the worker no longer owns it.",
                    );

                    return;
                }

                if (terminal) {
                    logger.error(
                        {
                            workerId: this.workerId,
                            jobId: job.id,
                            type: job.type,
                            attempts: job.attempts,
                            error: errorMessage,
                        },
                        "Background job exhausted its attempts.",
                    );
                } else {
                    logger.warn(
                        {
                            workerId: this.workerId,
                            jobId: job.id,
                            type: job.type,
                            attempts: job.attempts,
                            retryDelayMs,
                            retryAt,
                            error: errorMessage,
                        },
                        "Background job failed and was scheduled for retry.",
                    );
                }
            } catch (updateError) {
                logger.error(
                    {
                        workerId: this.workerId,
                        jobId: job.id,
                        originalError: errorMessage,
                        updateError: getErrorMessage(updateError),
                    },
                    "Could not update failed background job.",
                );
            }
        }
    }
}
