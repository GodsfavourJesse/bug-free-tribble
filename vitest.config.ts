import { defineConfig } from "vitest/config";

/**
 * Hermetic test environment: never depends on a developer's
 * local .env (dotenv does not override variables that are
 * already set).
 */
export default defineConfig({
    test: {
        include: ["tests/**/*.test.ts"],
        env: {
            NODE_ENV: "test",
            LOG_LEVEL: "silent",
            DATABASE_URL: "postgres://test:test@127.0.0.1:5432/karmass_test",
            DATABASE_CONNECTION_TIMEOUT_MS: "500",
            SESSION_SECRET: "test-session-secret-test-session-secret-0123456789",
            CLIENT_URL: "http://localhost:3000",
            CORS_ORIGINS: "http://localhost:3001",
            CLOUDINARY_CLOUD_NAME: "test",
            CLOUDINARY_API_KEY: "test",
            CLOUDINARY_API_SECRET: "test",
            JSON_BODY_LIMIT: "1kb",
            RATE_LIMIT_MAX_REQUESTS: "1000",
            AUTH_RATE_LIMIT_MAX_REQUESTS: "3",
        },
    },
});
