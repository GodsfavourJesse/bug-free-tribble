import "dotenv/config";
import pg from "pg";

const { Client } = pg;

async function main() {
    console.log("DATABASE_URL loaded:", Boolean(process.env.DATABASE_URL));

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 10_000,
    });

    try {
        console.log("Connecting to PostgreSQL...");

        await client.connect();

        console.log("Connected successfully.");

        const result = await client.query(
            "SELECT current_database(), current_user, NOW() AS server_time;",
        );

        console.log(result.rows);
    } catch (error) {
        console.error("DATABASE CONNECTION FAILED:");
        console.error(error);

        process.exitCode = 1;
    } finally {
        await client.end().catch(() => undefined);
    }
}

await main();