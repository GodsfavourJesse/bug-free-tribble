import { Queue } from "bullmq";

import { redis } from "../redis/redis.ts";
import { QUEUE_NAMES } from "./queue-names.ts";
import { DEFAULT_JOB_OPTIONS } from "./queue-options.ts";

export const notificationsQueue = new Queue(
    QUEUE_NAMES.NOTIFICATIONS,
    {
        connection: redis,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
    },
);

export const listingLifecycleQueue = new Queue(
    QUEUE_NAMES.LISTING_LIFECYCLE,
    {
        connection: redis,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
    },
);

export const subscriptionLifecycleQueue = new Queue(
    QUEUE_NAMES.SUBSCRIPTION_LIFECYCLE,
    {
        connection: redis,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
    },
);

export const paymentsQueue = new Queue(
    QUEUE_NAMES.PAYMENTS,
    {
        connection: redis,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
    },
);

export const imageIntelligenceQueue = new Queue(
    QUEUE_NAMES.IMAGE_INTELLIGENCE,
    {
        connection: redis,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
    },
);

export const emailQueue = new Queue(
    QUEUE_NAMES.EMAIL,
    {
        connection: redis,
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
    },
);