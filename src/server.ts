import http from "node:http";

import app from "./app.ts";
import { env } from "./config/env.ts";
import { markShuttingDown } from "./config/lifecycle.ts";
import { logger } from "./config/logger.ts";
import { closeDatabase } from "./database/index.ts";
import { redis } from "./infrastructure/redis/redis.ts";
import {
    initializeSocket,
} from "./realtime/socket.ts";

import {
    startPaymentReconcilationScheduler,
    stopPaymentReconciliationScheduler,
} from "./modules/payment-module/payment-reconcilation/payment-reconciliation.scheduler.ts";

import {
    startPaymentEventScheduler,
    stopPaymentEventScheduler,
} from "./modules/payment-module/payment-event/payment-event.scheduler.ts";

import {
    startBoostExpiryScheduler,
    stopBoostExpiryScheduler,
} from "./modules/boosts-module/boost-expiry/boost-expiry.scheduler.ts";
import { startNotificationWorker } from "./modules/notification-module/notification-worker/notification-worker.ts";
import { emailWorker } from "./jobs/workers/email.worker.ts";


// -----------------------------------------------------------------------------
// HTTP SERVER
// -----------------------------------------------------------------------------

const httpServer = http.createServer(app);

// Keep-alive must outlive the load balancer's idle timeout.
httpServer.keepAliveTimeout = 65_000;
httpServer.headersTimeout = 66_000;

// -----------------------------------------------------------------------------
// SOCKET.IO
// -----------------------------------------------------------------------------

const io = initializeSocket(httpServer);

// -----------------------------------------------------------------------------
// NOTIFICATION WORKER
// -----------------------------------------------------------------------------

type NotificationWorkerHandle = ReturnType<
    typeof startNotificationWorker
>;

let notificationWorker: NotificationWorkerHandle | undefined;

// -----------------------------------------------------------------------------
// SERVER SHUTDOWN HELPERS
// -----------------------------------------------------------------------------

function closeServers(): Promise<void> {
    return new Promise((resolve) => {
        io.close(() => {
            resolve();
        });

        // Drop idle keep-alive sockets so shutdown can complete.
        httpServer.closeIdleConnections();
    });
}

// -----------------------------------------------------------------------------
// GRACEFUL SHUTDOWN
// -----------------------------------------------------------------------------

let shutdownStarted = false;

async function shutdown(
    reason: string,
    exitCode: number,
): Promise<void> {
    if (shutdownStarted) {
        logger.warn(
            { reason },
            "Shutdown already in progress",
        );

        return;
    }

    shutdownStarted = true;

    logger.info(
        { reason },
        "Shutting down KARMASS API",
    );

    // Readiness probes should fail while the instance drains.
    markShuttingDown();

    const forceTimer = setTimeout(() => {
        logger.error(
            { timeoutMs: env.SHUTDOWN_TIMEOUT_MS },
            "Graceful shutdown timed out; forcing exit",
        );

        httpServer.closeAllConnections();

        process.exit(1);
    }, env.SHUTDOWN_TIMEOUT_MS);

    forceTimer.unref();

    try {
        // Stop future notification-worker polling cycles.
        // Do this before closing database dependencies.
        notificationWorker?.stop();
        notificationWorker = undefined;

        // Stop accepting new requests and disconnect Socket.IO clients.
        await closeServers();

        // Stop background schedulers before closing their dependencies.
        await stopBoostExpiryScheduler();

        await stopPaymentReconciliationScheduler();

        await stopPaymentEventScheduler();

        // Close Redis before shutting down the database.
        await redis.quit();

        await emailWorker.close();

        await closeDatabase();

        clearTimeout(forceTimer);

        logger.info("Shutdown complete");

        process.exit(exitCode);
    } catch (error) {
        logger.error(
            { err: error },
            "Error during shutdown",
        );

        process.exit(1);
    }
}

// -----------------------------------------------------------------------------
// HTTP SERVER ERROR HANDLING
// -----------------------------------------------------------------------------

httpServer.on("error", (error) => {
    logger.fatal(
        { err: error },
        "HTTP server error",
    );

    void shutdown("HTTP server error", 1);
});

async function waitForRedisReady(): Promise<void> {
    if (redis.status === "ready") {
        return;
    }

    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error("Redis connection timed out after 15 seconds"));
        }, 15000);

        const cleanup = () => {
            clearTimeout(timeout);
            redis.off("ready", onReady);
            redis.off("error", onError);
            redis.off("end", onEnd);
        };

        const onReady = () => {
            cleanup();
            resolve();
        };

        const onError = (error: Error) => {
            cleanup();
            reject(error);
        };

        const onEnd = () => {
            cleanup();
            reject(new Error("Redis connection ended before becoming ready"));
        };

        redis.once("ready", onReady);
        redis.once("error", onError);
        redis.once("end", onEnd);

        // Only initiate a connection if Redis has not started connecting.
        if (redis.status === "wait") {
            redis.connect().catch(onError);
        }
    });
}

// -----------------------------------------------------------------------------
// APPLICATION STARTUP
// -----------------------------------------------------------------------------

async function start(): Promise<void> {
    try {
        // Wait for the existing Redis connection to become ready.
        await waitForRedisReady();

        logger.info("Redis connection ready");

        notificationWorker = startNotificationWorker();

        logger.info("Notification delivery worker started");

        startPaymentReconcilationScheduler();
        startPaymentEventScheduler();
        startBoostExpiryScheduler();

        await new Promise<void>((resolve, reject) => {
            const onError = (error: Error): void => {
                httpServer.off("listening", onListening);
                reject(error);
            };

            const onListening = (): void => {
                httpServer.off("error", onError);
                resolve();
            };

            httpServer.once("error", onError);
            httpServer.once("listening", onListening);

            httpServer.listen(env.PORT, () => {
                logger.info(
                    {
                        port: env.PORT,
                        nodeEnv: env.NODE_ENV,
                    },
                    "KARMASS API listening",
                );
            });
        });
    } catch (error) {
        logger.fatal(
            { err: error },
            "Failed to start KARMASS API",
        );

        await shutdown("Startup failure", 1);
    }
}

// -----------------------------------------------------------------------------
// PROCESS SIGNALS
// -----------------------------------------------------------------------------

process.on(
    "SIGINT",
    () => {
        void shutdown("SIGINT", 0);
    },
);

process.on(
    "SIGTERM",
    () => {
        void shutdown("SIGTERM", 0);
    },
);

// After an uncaught exception, the process state is unknown.
// Drain resources and exit non-zero so the supervisor can restart it.
process.on("uncaughtException", (error) => {
    logger.fatal(
        { err: error },
        "Uncaught exception",
    );

    void shutdown("uncaughtException", 1);
});

process.on("unhandledRejection", (reason) => {
    logger.fatal(
        { err: reason },
        "Unhandled promise rejection",
    );

    void shutdown("unhandledRejection", 1);
});

// -----------------------------------------------------------------------------
// BOOTSTRAP
// -----------------------------------------------------------------------------

void start();