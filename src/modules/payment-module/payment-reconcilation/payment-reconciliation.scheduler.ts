import { logger } from "../../../config/logger.ts";

import {
    processPaymentReconciliationBatch,
} from "./payment-reconcilation.worker.service.ts";

import {
    discoverPaymentsForReconciliation,
} from "./payment-reconciliation-discovery.service.ts";

const DEFAULT_INTERVAL_MS = 60_000;

let timer: ReturnType<typeof setInterval> | undefined;

let running = false;

let currentRun: Promise<void> | undefined;

/*
 * ============================================================
 * RUN RECONCILIATION CYCLE
 * ============================================================
 */

async function runReconciliationCycle(): Promise<void> {
    if (running) {
        logger.debug(
            "Skipping reconciliation tick because the previous cycle is still running.",
        );

        return;
    }

    running = true;

    try {
        /*
         * Step 1: Discover eligible payments.
         */
        const discovery =
            await discoverPaymentsForReconciliation();

        /*
         * Step 2: Process due reconciliation records.
         */
        const processing =
            await processPaymentReconciliationBatch();

        if (
            discovery.examined > 0 ||
            processing.claimed > 0
        ) {
            logger.info(
                {
                    discovery,
                    processing,
                },
                "Payment reconciliation cycle completed.",
            );
        }
    } catch (error) {
        logger.error(
            {
                err: error,
            },
            "Payment reconciliation cycle failed.",
        );
    } finally {
        running = false;
        currentRun = undefined;
    }
}

/*
 * ============================================================
 * START SCHEDULER
 * ============================================================
 */

export function startPaymentReconciliationScheduler(
    intervalMs = DEFAULT_INTERVAL_MS,
): void {
    if (timer) {
        logger.warn(
            "Payment reconciliation scheduler is already running.",
        );

        return;
    }

    if (
        !Number.isFinite(intervalMs) ||
        intervalMs < 1_000
    ) {
        throw new Error(
            "Payment reconciliation interval must be at least 1000ms.",
        );
    }

    logger.info(
        {
            intervalMs,
        },
        "Starting payment reconciliation scheduler.",
    );

    /*
     * Run immediately on startup.
     */
    currentRun = runReconciliationCycle();

    /*
     * Continue periodically.
     */
    timer = setInterval(() => {
        if (running) {
            return;
        }

        currentRun = runReconciliationCycle();
    }, intervalMs);

    timer.unref();
}

/*
 * ============================================================
 * STOP SCHEDULER
 * ============================================================
 */

export async function stopPaymentReconciliationScheduler(): Promise<void> {
    if (timer) {
        clearInterval(timer);
        timer = undefined;
    }

    if (currentRun) {
        await currentRun;
    }

    logger.info(
        "Payment reconciliation scheduler stopped.",
    );
}