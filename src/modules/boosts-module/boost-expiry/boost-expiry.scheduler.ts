import { logger } from "../../../config/logger.ts";
import {
    expireBoosts,
} from "./boost-expiry.service.ts";

const BOOST_EXPIRY_INTERVAL_MS = 60_000;

let interval: ReturnType<typeof setInterval> | undefined;

let running = false;

/**
 * Run one expiry cycle.
 *
 * Prevents overlapping executions within the same process.
 */
async function runBoostExpiryCycle(): Promise<void> {
    if (running) {
        return;
    }

    running = true;

    try {
        const expiredCount = await expireBoosts();

        if (expiredCount > 0) {
            logger.info(
                {
                    expiredCount,
                },
                "Boost expiry cycle completed",
            );
        }
    } catch (error) {
        logger.error(
            {
                err: error,
            },
            "Boost expiry cycle failed",
        );
    } finally {
        running = false;
    }
}

/**
 * Start the boost expiry scheduler.
 */
export function startBoostExpiryScheduler(): void {
    if (interval) {
        return;
    }

    logger.info(
        {
            intervalMs: BOOST_EXPIRY_INTERVAL_MS,
        },
        "Starting boost expiry scheduler",
    );

    interval = setInterval(
        () => {
            void runBoostExpiryCycle();
        },
        BOOST_EXPIRY_INTERVAL_MS,
    );

    interval.unref();

    // Run once at startup rather than waiting for the first interval.
    void runBoostExpiryCycle();
}

/**
 * Stop the scheduler and wait for an active cycle to finish.
 */
export async function stopBoostExpiryScheduler(): Promise<void> {
    if (interval) {
        clearInterval(interval);
        interval = undefined;
    }

    while (running) {
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 50);
        });
    }

    logger.info("Boost expiry scheduler stopped");
}