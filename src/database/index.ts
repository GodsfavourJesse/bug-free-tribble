import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";

import { databaseSslMode, env } from "../config/env.ts";
import { logger } from "../config/logger.ts";
import * as schema from "./schema/index.ts";

const { Pool } = pg;

function resolveSsl(): pg.PoolConfig["ssl"] {
    switch (databaseSslMode) {
        case "verify":
            return {
                rejectUnauthorized: true,
            };

        case "no-verify":
            // Use only if your database provider requires it
            // and you understand the security implications.
            return {
                rejectUnauthorized: false,
            };

        default:
            return undefined;
    }
}

export const pool = new Pool({
    connectionString: env.DATABASE_URL,

    max: env.DATABASE_POOL_MAX,

    idleTimeoutMillis: env.DATABASE_IDLE_TIMEOUT_MS,

    connectionTimeoutMillis: env.DATABASE_CONNECTION_TIMEOUT_MS,

    application_name: "karmass-api",

    ...(env.DATABASE_STATEMENT_TIMEOUT_MS > 0
        ? {
              statement_timeout: env.DATABASE_STATEMENT_TIMEOUT_MS,
          }
        : {}),

    ssl: resolveSsl(),
});

pool.on("error", (error) => {
    logger.error(
        { err: error },
        "Unexpected PostgreSQL pool error",
    );
});

export const db = drizzle(pool, {
    schema,
});

export async function isDatabaseHealthy(
    timeoutMs = 2_000,
): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;

    try {
        await Promise.race([
            db.execute(sql`select 1`),

            new Promise<never>((_resolve, reject) => {
                timer = setTimeout(
                    () => reject(
                        new Error("Database health check timed out."),
                    ),
                    timeoutMs,
                );
            }),
        ]);

        return true;
    } catch (error) {
        logger.warn(
            { err: error },
            "Database health check failed",
        );

        return false;
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}

let closing: Promise<void> | null = null;

export function closeDatabase(): Promise<void> {
    closing ??= pool.end();

    return closing;
}