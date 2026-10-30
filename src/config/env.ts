import "dotenv/config";
import { z } from "zod";

// Comma-separated list helper.
const csv = z
    .string()
    .optional()
    .transform((value) =>
        (value ?? "")
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item.length > 0),
    );

const envSchema = z.object({
    // APPLICATION
    NODE_ENV: z
        .enum(["development", "test", "production"])
        .default("development"),

    PORT: z.coerce
        .number()
        .int()
        .min(1)
        .max(65535)
        .default(4000),

    CLIENT_URL: z
        .string()
        .url()
        .default("http://localhost:3000"),

    API_URL: z
        .string()
        .url()
        .default("http://localhost:4000"),

    CORS_ORIGINS: csv,

    TRUST_PROXY: z.coerce
        .number()
        .int()
        .min(0)
        .max(10)
        .default(1),

    SHUTDOWN_TIMEOUT_MS: z.coerce
        .number()
        .int()
        .min(1_000)
        .max(120_000)
        .default(15_000),

    // DATABASE
    DATABASE_URL: z
        .string()
        .min(1, "DATABASE_URL is required.")
        .refine(
            (value) => /^postgres(ql)?:\/\//i.test(value),
            "DATABASE_URL must be a postgres:// or postgresql:// URL.",
        ),

    DATABASE_POOL_MAX: z.coerce
        .number()
        .int()
        .positive()
        .max(100)
        .default(20),

    DATABASE_IDLE_TIMEOUT_MS: z.coerce
        .number()
        .int()
        .nonnegative()
        .default(10_000),

    DATABASE_CONNECTION_TIMEOUT_MS: z.coerce
        .number()
        .int()
        .positive()
        .default(10_000),

    // Zero disables the timeout.
    DATABASE_STATEMENT_TIMEOUT_MS: z.coerce
        .number()
        .int()
        .nonnegative()
        .default(30_000),

    SUPABASE_CA_CERT_BASE64: z
        .string()
        .min(1)
        .optional(),

    // Database TLS
    // disable: no TLS
    // verify: TLS with certificate verification
    // no-verify: TLS without certificate verification
    DATABASE_SSL: z
        .enum(["disable", "verify", "no-verify"])
        .default("verify"),

    // SESSION
    SESSION_COOKIE_NAME: z
        .string()
        .min(1)
        .default("karmass_session"),

    SESSION_SECRET: z
        .string()
        .min(
            64,
            "SESSION_SECRET must be at least 64 characters.",
        ),

    SESSION_TTL_DAYS: z.coerce
        .number()
        .int()
        .positive()
        .max(365)
        .default(30),

    SESSION_COOKIE_SECURE: z
        .enum(["true", "false"])
        .default("false")
        .transform((value) => value === "true"),

    SESSION_COOKIE_SAME_SITE: z
        .enum(["strict", "lax", "none"])
        .default("lax"),

    // INITIAL SUPER ADMIN BOOTSTRAP
    // Optional during normal startup.
    // The explicit seed command requires all four values.
    BOOTSTRAP_SUPER_ADMIN_EMAIL: z.preprocess(
        (value) =>
            typeof value === "string" && value.trim() === ""
                ? undefined
                : value,
        z
            .string()
            .trim()
            .email()
            .max(255)
            .optional(),
    ),

    BOOTSTRAP_SUPER_ADMIN_PASSWORD: z.preprocess(
        (value) =>
            typeof value === "string" && value.trim() === ""
                ? undefined
                : value,
        z
            .string()
            .min(
                16,
                "Bootstrap Super Admin password must be at least 16 characters.",
            )
            .optional(),
    ),

    BOOTSTRAP_SUPER_ADMIN_FIRST_NAME: z.preprocess(
        (value) =>
            typeof value === "string" && value.trim() === ""
                ? undefined
                : value,
        z
            .string()
            .trim()
            .min(1)
            .max(100)
            .optional(),
    ),

    BOOTSTRAP_SUPER_ADMIN_LAST_NAME: z.preprocess(
        (value) =>
            typeof value === "string" && value.trim() === ""
                ? undefined
                : value,
        z
            .string()
            .trim()
            .min(1)
            .max(100)
            .optional(),
    ),

    // HTTP
    JSON_BODY_LIMIT: z
        .string()
        .default("1mb"),

    URL_ENCODED_BODY_LIMIT: z
        .string()
        .default("1mb"),

    // RATE LIMITING
    RATE_LIMIT_WINDOW_MS: z.coerce
        .number()
        .int()
        .positive()
        .default(15 * 60 * 1000),

    RATE_LIMIT_MAX_REQUESTS: z.coerce
        .number()
        .int()
        .positive()
        .default(300),

    AUTH_RATE_LIMIT_WINDOW_MS: z.coerce
        .number()
        .int()
        .positive()
        .default(15 * 60 * 1000),

    AUTH_RATE_LIMIT_MAX_REQUESTS: z.coerce
        .number()
        .int()
        .positive()
        .default(20),

    // EMAIL
    // Store only the verified sender email address here.
    EMAIL_FROM: z
        .string()
        .trim()
        .email()
        .optional(),

    // Display name shown to email recipients.
    EMAIL_FROM_NAME: z
        .string()
        .trim()
        .min(1)
        .default("KARMASS"),

    SMTP_HOST: z
        .string()
        .trim()
        .min(1)
        .optional(),

    SMTP_PORT: z.coerce
        .number()
        .int()
        .min(1)
        .max(65535)
        .default(587),

    SMTP_USER: z
        .string()
        .trim()
        .min(1)
        .optional(),

    SMTP_PASSWORD: z
        .string()
        .min(1)
        .optional(),

    EMAIL_VERIFICATION_TTL_MINUTES: z.coerce
        .number()
        .int()
        .positive()
        .default(30),

    // PAYMENTS
    PAYSTACK_SECRET_KEY: z
        .string()
        .min(1)
        .optional(),

    PAYSTACK_WEBHOOK_SECRET: z
        .string()
        .min(1)
        .optional(),

    // CLOUDINARY
    CLOUDINARY_CLOUD_NAME: z
        .string()
        .min(1, "CLOUDINARY_CLOUD_NAME is required."),

    CLOUDINARY_API_KEY: z
        .string()
        .min(1, "CLOUDINARY_API_KEY is required."),

    CLOUDINARY_API_SECRET: z
        .string()
        .min(1, "CLOUDINARY_API_SECRET is required."),

    CLOUDINARY_FOLDER: z
        .string()
        .min(1)
        .default("karmass"),

    // LOGGING
    LOG_LEVEL: z
        .enum([
            "fatal",
            "error",
            "warn",
            "info",
            "debug",
            "trace",
            "silent",
        ])
        .default("info"),

    // FILE UPLOADS
    MAX_IMAGE_SIZE_MB: z.coerce
        .number()
        .positive()
        .max(100)
        .default(10),

    MAX_IMAGES_PER_LISTING: z.coerce
        .number()
        .int()
        .positive()
        .max(50)
        .default(20),

    MAX_IMAGE_WIDTH: z.coerce
        .number()
        .int()
        .positive()
        .max(20_000)
        .default(4096),

    MAX_IMAGE_HEIGHT: z.coerce
        .number()
        .int()
        .positive()
        .max(20_000)
        .default(4096),

    IMAGE_MIN_WIDTH: z.coerce
        .number()
        .int()
        .positive()
        .default(200),

    IMAGE_MIN_HEIGHT: z.coerce
        .number()
        .int()
        .positive()
        .default(200),

    IMAGE_THUMBNAIL_WIDTH: z.coerce
        .number()
        .int()
        .positive()
        .max(2000)
        .default(600),

    IMAGE_THUMBNAIL_HEIGHT: z.coerce
        .number()
        .int()
        .positive()
        .max(2000)
        .default(600),

    PRIVATE_DOCUMENT_SIGNED_URL_TTL_SECONDS: z.coerce
        .number()
        .int()
        .positive()
        .max(86_400)
        .default(300),

    UPLOAD_RATE_LIMIT_WINDOW_MS: z.coerce
        .number()
        .int()
        .positive()
        .default(15 * 60 * 1000),

    UPLOAD_RATE_LIMIT_MAX_REQUESTS: z.coerce
        .number()
        .int()
        .positive()
        .max(1000)
        .default(50),

    // WORKER
    WORKER_POLL_MS: z.coerce
        .number()
        .int()
        .positive()
        .min(100)
        .max(60_000)
        .default(1_000),

    // AUTHENTICATION SECURITY
    AUTH_LOGIN_MAX_ATTEMPTS: z.coerce
        .number()
        .int()
        .positive()
        .max(20)
        .default(5),

    AUTH_LOGIN_WINDOW_MINUTES: z.coerce
        .number()
        .int()
        .positive()
        .max(120)
        .default(15),

    AUTH_LOGIN_LOCKOUT_MINUTES: z.coerce
        .number()
        .int()
        .positive()
        .max(1440)
        .default(15),

    AUTH_VERIFICATION_MAX_ATTEMPTS: z.coerce
        .number()
        .int()
        .positive()
        .max(20)
        .default(5),

    AUTH_VERIFICATION_RESEND_COOLDOWN_SECONDS: z.coerce
        .number()
        .int()
        .positive()
        .max(3600)
        .default(60),

    AUTH_VERIFICATION_MAX_RESENDS_PER_HOUR: z.coerce
        .number()
        .int()
        .positive()
        .max(50)
        .default(5),

    PASSWORD_RESET_TTL_MINUTES: z.coerce
        .number()
        .int()
        .positive()
        .max(1440)
        .default(30),

    PASSWORD_RESET_RESEND_COOLDOWN_SECONDS: z.coerce
        .number()
        .int()
        .positive()
        .max(3600)
        .default(60),

    // STORAGE
    STORAGE_ORPHAN_GRACE_PERIOD_HOURS: z.coerce
        .number()
        .int()
        .positive()
        .max(168)
        .default(24),

    STORAGE_CLEANUP_BATCH_SIZE: z.coerce
        .number()
        .int()
        .positive()
        .max(500)
        .default(500),

    REDIS_URL: z
        .string()
        .url()
        .default("redis://localhost:6379"),

    // WEB PUSH / PWA NOTIFICATIONS
    VAPID_SUBJECT: z
        .string()
        .min(1)
        .default("mailto:karmassapp@gmail.com"),

    VAPID_PUBLIC_KEY: z
        .string()
        .min(1)
        .optional(),

    VAPID_PRIVATE_KEY: z
        .string()
        .min(1)
        .optional(),

    // CSRF
    CSRF_SECRET: z
        .string()
        .min(
            64,
            "CSRF_SECRET must be at least 64 characters.",
        ),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse the environment and fail with a readable list
 * instead of a raw ZodError dump.
 */
function parseEnvironment(): Env {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        const lines = result.error.issues.map((issue) => {
            const variable = issue.path.join(".") || "(root)";

            return `- ${variable}: ${issue.message}`;
        });

        throw new Error(
            [
                "Invalid environment configuration:",
                ...lines,
            ].join("\n"),
        );
    }

    return result.data;
}

export const env = parseEnvironment();

/**
 * All browser origins allowed to call the API (CORS + Socket.IO).
 * Trailing slashes are removed because browsers never send them
 * in the Origin header.
 */
export const allowedOrigins: readonly string[] = Array.from(
    new Set(
        [env.CLIENT_URL, ...env.CORS_ORIGINS].map((origin) =>
            origin.replace(/\/+$/, ""),
        ),
    ),
);

/**
 * Resolved TLS mode for the PostgreSQL connection.
 */
export const databaseSslMode: "disable" | "verify" | "no-verify" =
    env.DATABASE_SSL ??
    (env.NODE_ENV === "production" ? "verify" : "disable");

const WEAK_SECRET_PATTERNS = [
    "change-me",
    "changeme",
    "change_me",
    "secret",
    "password",
    "example",
    "your-",
];

function isLocalUrl(value: string): boolean {
    try {
        const { hostname } = new URL(value);

        return (
            hostname === "localhost" ||
            hostname === "127.0.0.1" ||
            hostname === "::1" ||
            hostname === "[::1]"
        );
    } catch {
        return false;
    }
}

/**
 * Production-only validation.
 *
 * Development stays convenient, but production must never
 * silently start with unsafe defaults. All problems are
 * reported together so they can be fixed in one pass.
 */
function validateProductionEnvironment(): void {
    if (env.NODE_ENV !== "production") {
        return;
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Session & cookies
    if (!env.SESSION_COOKIE_SECURE) {
        errors.push(
            "SESSION_COOKIE_SECURE must be true in production.",
        );
    }

    if (
        env.SESSION_COOKIE_SAME_SITE === "none" &&
        !env.SESSION_COOKIE_SECURE
    ) {
        errors.push(
            "SameSite=None requires secure cookies.",
        );
    }

    const lowerSecret = env.SESSION_SECRET.toLowerCase();

    if (
        WEAK_SECRET_PATTERNS.some((pattern) =>
            lowerSecret.includes(pattern),
        )
    ) {
        errors.push(
            "SESSION_SECRET appears to use a placeholder or development value.",
        );
    }

    if (env.SESSION_SECRET.length < 64) {
        errors.push(
            "SESSION_SECRET should be at least 64 characters in production.",
        );
    }

    const lowerCsrfSecret = env.CSRF_SECRET.toLowerCase();

    if (
        WEAK_SECRET_PATTERNS.some((pattern) =>
            lowerCsrfSecret.includes(pattern),
        )
    ) {
        errors.push(
            "CSRF_SECRET appears to use a placeholder or development value.",
        );
    }

    if (env.CSRF_SECRET.length < 64) {
        errors.push(
            "CSRF_SECRET must be at least 64 characters in production.",
        );
    }

    // Public URLs
    for (const [name, value] of [
        ["CLIENT_URL", env.CLIENT_URL],
        ["API_URL", env.API_URL],
    ] as const) {
        if (!value.startsWith("https://")) {
            errors.push(
                `${name} must use https:// in production.`,
            );
        }

        if (isLocalUrl(value)) {
            errors.push(
                `${name} must not point to localhost in production.`,
            );
        }
    }

    for (const origin of env.CORS_ORIGINS) {
        if (!origin.startsWith("https://")) {
            errors.push(
                `CORS_ORIGINS entry "${origin}" must use https:// in production.`,
            );
        }

        if (origin === "*") {
            errors.push(
                "CORS_ORIGINS must not contain a wildcard in production.",
            );
        }
    }

    // Database
    if (databaseSslMode === "disable") {
        errors.push(
            'DATABASE_SSL must not be "disable" in production.',
        );
    }

    if (
        isLocalUrl(
            env.DATABASE_URL.replace(
                /^postgres(ql)?:/i,
                "http:",
            ),
        )
    ) {
        warnings.push(
            "DATABASE_URL points to localhost in production.",
        );
    }

    // Email
    if (
        !env.EMAIL_FROM ||
        !env.SMTP_HOST ||
        !env.SMTP_USER ||
        !env.SMTP_PASSWORD
    ) {
        errors.push(
            "EMAIL_FROM, SMTP_HOST, SMTP_USER and SMTP_PASSWORD are required in production (email verification depends on them).",
        );
    }

    // Payments
    if (!env.PAYSTACK_SECRET_KEY) {
        errors.push(
            "PAYSTACK_SECRET_KEY is required in production (payments and webhook verification).",
        );
    } else if (
        env.PAYSTACK_SECRET_KEY.startsWith("sk_test_")
    ) {
        errors.push(
            "PAYSTACK_SECRET_KEY is a test key; use a live key in production.",
        );
    }

    // Operational warnings
    if (env.TRUST_PROXY === 0) {
        warnings.push(
            "TRUST_PROXY is 0. Behind a load balancer every client will share the proxy IP for rate limiting; set TRUST_PROXY=1 (or the real hop count).",
        );
    }

    if (
        env.LOG_LEVEL === "debug" ||
        env.LOG_LEVEL === "trace"
    ) {
        warnings.push(
            `LOG_LEVEL=${env.LOG_LEVEL} is very verbose for production.`,
        );
    }

    if (env.PAYSTACK_WEBHOOK_SECRET) {
        warnings.push(
            "PAYSTACK_WEBHOOK_SECRET is set but unused: Paystack signs webhooks with PAYSTACK_SECRET_KEY.",
        );
    }

    for (const warning of warnings) {
        process.stderr.write(
            `[config warning] ${warning}\n`,
        );
    }

    if (errors.length > 0) {
        throw new Error(
            [
                "Production environment validation failed:",
                ...errors.map((error) => `- ${error}`),
            ].join("\n"),
        );
    }
}

validateProductionEnvironment();

/**
 * Returns whether all required email delivery settings exist.
 */
export function isEmailConfigured(): boolean {
    return Boolean(
        env.EMAIL_FROM &&
        env.SMTP_HOST &&
        env.SMTP_USER &&
        env.SMTP_PASSWORD,
    );
}

/**
 * Returns whether Paystack is configured.
 */
export function isPaystackConfigured(): boolean {
    return Boolean(env.PAYSTACK_SECRET_KEY);
}