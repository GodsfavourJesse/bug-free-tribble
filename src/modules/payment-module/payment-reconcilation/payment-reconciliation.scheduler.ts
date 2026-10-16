import { resolve } from "node:dns";
import { logger } from "../../../config/logger.ts";
import { processPaymentReconciliationBatch } from "./payment-reconcilation.worker.service.ts";

const DEFAULT_INTERNAL_MS = 60_000;

let timer: ReturnType<typeof setInterval> | undefined;
let running = false;

export function startPaymentReconcilationScheduler(
    intervalMs = DEFAULT_INTERNAL_MS,
) : void {
    if (timer) {
        logger.warn(
            "Payment reconciliation scheduler is already running",
        );
        return;
    }

    if (!Number.isFinite(intervalMs) || intervalMs < 1_000) {
        throw new Error(
            "Payment reconciliation must be at least 1000ms",
        );
    }

    logger.info(
        { intervalMs },
        "Starting payment reconciliation scheduler",
    );

    const runBatch = async (): Promise<void> => {
        if (running) {
            logger.debug(
                "Skipping reconciliation tick because the previous batch is still running,"
            );
            return;
        }

        running = true;

        try {
            const result = await processPaymentReconciliationBatch();

            if (result.claimed > 0) {
                logger.info(
                    result,
                    "Payment reconciliation batch completed",
                );
            }
        } catch (error) {
            logger.error(
                { err: error },
                "Payment reconciliation batch failed",
            );
        } finally {
            running = false;
        }
    };

    // Run once at startup, then periodically
    void runBatch();

    timer = setInterval(
        () => void runBatch(),
        intervalMs,
    );

    timer.unref();
}

export async function  stopPaymentReconciliationScheduler(): Promise<void> {
    if (timer) {
        clearInterval(timer);
        timer = undefined;
    }

    // Wait for the currently running batch to finish.
    while (running) {
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 100);
        });
    }

    logger.info(
        "Payment reconciliation scheduler stopped",
    );
}