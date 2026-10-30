import { Worker } from "bullmq";

import {
    handleEmailJob,
    type PasswordResetEmailJob,
} from "../handlers/email.handler.ts";
import { QUEUE_NAMES } from "../../infrastructure/queues/queue-names.ts";
import { redis } from "../../infrastructure/redis/redis.ts";
import { logger } from "../../config/logger.ts";

export const emailWorker = new Worker<PasswordResetEmailJob>(
    QUEUE_NAMES.EMAIL,

    handleEmailJob,

    {
        connection: redis,
        concurrency: 5,
    },
);

emailWorker.on("completed", (job) => {
    logger.info(
        {
            jobId: job.id,
            queue: QUEUE_NAMES.EMAIL,
        },
        "Email job completed",
    );
});

emailWorker.on("failed", (job, error) => {
    logger.error(
        {
            jobId: job?.id,
            queue: QUEUE_NAMES.EMAIL,
            err: error,
        },
        "Email job failed",
    );
});

emailWorker.on("error", (error) => {
    logger.error(
        { err: error },
        "Email worker encountered an error",
    );
});