import { env } from "../config/env.ts";
import { logger } from "../config/logger.ts";
import { closeDatabase } from "../database/index.ts";

import {
    newWorkerId,
} from "../infrastructure/jobs/job.queue.ts";

const workerId = newWorkerId();

const POLL_INTERVAL_MS = env.WORKER_POLL_MS;

let running = true;
let shutdownPromise: Promise<void> | null = null;
let loopPromise: Promise<void> | null = null;

function sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, milliseconds);
    });
}

async function loop(): Promise<void> {
    logger.info(
        { workerId, pollIntervalMs: POLL_INTERVAL_MS },
        "KARMASS general worker started; no job handlers are registered",
    );

    while (running) {
        await sleep(POLL_INTERVAL_MS);
    }

    logger.info(
        { workerId },
        "KARMASS general worker loop stopped",
    );
}

async function shutdown(signal: string): Promise<void> {
    if (shutdownPromise) {
        await shutdownPromise;
        return;
    }

    running = false;

    shutdownPromise = (async () => {
        logger.info(
            { signal, workerId },
            "KARMASS general worker shutting down",
        );

        try {
            if (loopPromise) {
                await loopPromise;
            }

            await closeDatabase();

            logger.info(
                { workerId },
                "KARMASS general worker shut down successfully",
            );
        } catch (error: unknown) {
            logger.error(
                { err: error, workerId },
                "KARMASS general worker shutdown failed",
            );

            process.exitCode = 1;
        }
    })();

    await shutdownPromise;
}

process.once("SIGINT", () => {
    void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
});

loopPromise = loop();

void loopPromise.catch(async (error: unknown) => {
    logger.fatal(
        { err: error, workerId },
        "KARMASS general worker stopped unexpectedly",
    );

    await shutdown("Fatal worker error");

    process.exitCode = 1;
});
