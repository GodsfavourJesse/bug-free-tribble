import { Worker } from "bullmq";

import { redis } from "../redis/redis.ts";
import { logger } from "../../config/logger.ts";

import { QUEUE_NAMES } from "./queue-names.ts";
import { sendPasswordResetEmail } from "../../modules/email-module/email.service.ts";

interface PasswordResetEmailJob {
    type: "PASSWORD_RESET";
    email: string;
    firstName: string;
    token: string;
}

export const emailWorker = new Worker<PasswordResetEmailJob>(
    QUEUE_NAMES.EMAIL,

    async (job) => {
        const {
            type,
            email,
            firstName,
            token,
        } = job.data;

        if (type !== "PASSWORD_RESET") {
            throw new Error(
                `Unsupported email job type: ${type}`,
            );
        }

        await sendPasswordResetEmail({
            email,
            firstName,
            token,
        });
    },

    {
        connection: redis,
        concurrency: 5,
    },
);

emailWorker.on("ready", () => {
    logger.info(
        "KARMASS email worker is ready",
    );
});

emailWorker.on("completed", (job) => {
    logger.info(
        {
            jobId: job.id,
            emailType: job.data.type,
        },
        "Email job completed",
    );
});

emailWorker.on("failed", (job, error) => {
    logger.error(
        {
            jobId: job?.id,
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