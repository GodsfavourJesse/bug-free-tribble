import {
    Redis,
} from "ioredis";

import { env } from "../../config/env.ts";

export const redis =
    new Redis(
        env.REDIS_URL,
        {
            maxRetriesPerRequest:
                null,

            enableReadyCheck:
                true,

            lazyConnect:
                true,
        },
    );

redis.on(
    "connect",
    () => {
        console.log(
            "Redis connection established.",
        );
    },
);

redis.on(
    "ready",
    () => {
        console.log(
            "Redis connection ready.",
        );
    },
);

redis.on(
    "error",
    (error: Error) => {
        console.error(
            "Redis connection error:",
            error,
        );
    },
);

redis.on(
    "close",
    () => {
        console.warn(
            "Redis connection closed.",
        );
    },
);