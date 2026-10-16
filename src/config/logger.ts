import pino, { type LoggerOptions } from "pino";

import { env } from "./env.ts";

const loggerOptions: LoggerOptions = {
    level: env.LOG_LEVEL,

    base: {
        service: "karmass-api",
        env: env.NODE_ENV,
    },

    redact: {
        paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "req.headers['x-api-key']",
            "res.headers['set-cookie']",

            "password",
            "passwordHash",
            "currentPassword",
            "newPassword",

            "sessionToken",
            "token",
            "accessToken",
            "refreshToken",

            "secret",
            "apiKey",
            "paystackSecretKey",

            "*.password",
            "*.passwordHash",
            "*.currentPassword",
            "*.newPassword",
            "*.token",
            "*.secret",
            "*.apiKey",
        ],

        censor: "[REDACTED]",
    },

    timestamp: pino.stdTimeFunctions.isoTime,
};

export const logger = pino(loggerOptions);
