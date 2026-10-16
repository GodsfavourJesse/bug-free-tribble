import type { JobsOptions } from "bullmq";

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
    attempts: 5,

    backoff: {
        type: "exponential",
        delay: 1_000,
    },

    removeOnComplete: {
        age: 24 * 60 * 60,
        count: 1_000,
    },

    removeOnFail: {
        age: 7 * 24 * 60 * 60,
    },
};