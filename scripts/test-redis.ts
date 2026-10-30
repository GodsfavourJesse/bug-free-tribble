import { redis } from "../src/infrastructure/redis/redis.ts";

async function main(): Promise<void> {
    try {
        if (redis.status === "wait") {
            await redis.connect();
        }

            const pong = await redis.ping();

            console.log(`Redis PING: ${pong}`);

            const testKey = "karmass:test:connection";

            await redis.set(testKey, "ok", "EX", 30);

            const value = await redis.get(testKey);

            console.log(`Redis GET: ${value}`);

            await redis.del(testKey);

            console.log("Redis connectivity test passed.");
        } catch (error: unknown) {
            console.error("Redis connectivity test failed:", error);

            process.exitCode = 1;
        } finally {
            if (redis.status !== "end") {
                await redis.quit();
            }
        }

    }

await main();