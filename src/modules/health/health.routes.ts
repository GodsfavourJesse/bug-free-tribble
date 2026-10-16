import { Router } from "express";

import { isShuttingDown } from "../../config/lifecycle.ts";
import { isDatabaseHealthy } from "../../database/index.ts";

const router = Router();

/**
 * Basic status. Cheap, no dependencies.
 */
router.get("/health", (_request, response) => {
    response.json({
        success: true,
        status: isShuttingDown() ? "shutting_down" : "ok",
        service: "karmass-api",
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
    });
});

/**
 * Liveness: the process is running. Stays 200 during shutdown
 * so the orchestrator does not kill a draining instance early.
 */
router.get("/health/live", (_request, response) => {
    response.status(200).json({
        success: true,
        status: "live",
    });
});

/**
 * Readiness: should the load balancer send traffic here?
 * Fails while shutting down (so traffic drains) or when the
 * database is unreachable.
 */
router.get("/health/ready", async (_request, response) => {
    if (isShuttingDown()) {
        response.status(503).json({
            success: false,
            status: "shutting_down",
        });
        return;
    }

    const databaseUp = await isDatabaseHealthy();

    response.status(databaseUp ? 200 : 503).json({
        success: databaseUp,
        status: databaseUp ? "ready" : "not_ready",
        checks: {
            database: databaseUp ? "up" : "down",
        },
    });
});

export default router;
