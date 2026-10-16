import type {
    Request,
    Response,
} from "express";

import { isDatabaseHealthy } from "../database/index.ts";
import { redis } from "../infrastructure/redis/redis.ts";
import { isShuttingDown } from "../config/lifecycle.ts";
import { logger } from "../config/logger.ts";

export async function getLiveness(
    _request: Request,
    response: Response,
): Promise<void> {
    response
        .status(200)
        .set("Cache-Control", "no-store")
        .json({
            success: true,
            status: "alive",
        });
}

export async function getReadiness(
    _request: Request,
    response: Response,
): Promise<void> {
    response.set("Cache-Control", "no-store");

    if (isShuttingDown()) {
        response.status(503).json({
            success: false,
            status: "shutting_down",
        });

        return;
    }

    let databaseHealthy = false;
    let redisHealthy = false;

    try {
        databaseHealthy = await isDatabaseHealthy();

        redisHealthy = redis.status === "ready";
    } catch (error) {
        logger.error(
            { err: error },
            "Readiness check failed",
        );
    }

    const ready = databaseHealthy && redisHealthy;

    response
        .status(ready ? 200 : 503)
        .json({
            success: ready,
            status: ready ? "ready" : "not_ready",
            dependencies: {
                database: databaseHealthy ? "up" : "down",
                redis: redisHealthy ? "up" : "down",
            },
        });
}