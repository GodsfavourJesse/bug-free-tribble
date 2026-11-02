import {
    and,
    asc,
    eq,
    inArray,
    lt,
    sql,
} from "drizzle-orm";

import { randomUUID } from "node:crypto";

import { db } from "../../../database/index.ts";

import {
    notificationDeliveryJobs,
    notifications,
    pushSubscriptions,
    users,
    subscriptions,
    subscriptionPlans,
    subscriptionPlanVersions,
    payments,
} from "../../../database/schema/index.ts";

import { getSocketIO } from "../../../realtime/socket.ts";

import {
    sendNotificationEmail,
    sendSubscriptionActivatedEmail,
    sendSubscriptionExpiryReminderEmail,
} from "../../email-module/email.service.ts";

import { sendWebPushToUser } from "../web-push/web-push.service.ts";

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_LOCK_TIMEOUT_MS = 60_000;

export interface NotificationWorkerOptions {
    batchSize?: number;
    pollIntervalMs?: number;
    lockTimeoutMs?: number;
    workerId?: string;
}

interface NotificationPayload {
    eventId: string;
    userId: string;
    type: string;
    title: string;
    message: string;
    data?: Record<string, unknown>;
}

interface SubscriptionActivatedEmailPayload {
    kind: "SUBSCRIPTION_ACTIVATED";
    userId: string;
    subscriptionId: string;
    paymentId: string;
}

interface SubscriptionExpiryReminderEmailPayload {
    kind: "SUBSCRIPTION_EXPIRY_REMINDER";
    userId: string;
    subscriptionId: string;
    expiresAt: string;
}

type SubscriptionEmailPayload =
    | SubscriptionActivatedEmailPayload
    | SubscriptionExpiryReminderEmailPayload;

interface ClaimedJob {
    id: string;
    userId: string;
    channel: "IN_APP" | "SOCKET" | "EMAIL" | "PUSH";
    payload: Record<string, unknown>;
    attempts: number;
    maxAttempts: number;
}

/**
 * Validate a generic notification payload.
 */
function getPayload(
    value: Record<string, unknown>,
): NotificationPayload {
    const {
        eventId,
        userId,
        type,
        title,
        message,
        data,
    } = value;

    if (
        typeof eventId !== "string" ||
        typeof userId !== "string" ||
        typeof type !== "string" ||
        typeof title !== "string" ||
        typeof message !== "string"
    ) {
        throw new Error(
            "Notification delivery payload is invalid.",
        );
    }

    if (
        data !== undefined &&
        (
            typeof data !== "object" ||
            data === null ||
            Array.isArray(data)
        )
    ) {
        throw new Error(
            "Notification delivery data must be an object.",
        );
    }

    return {
        eventId,
        userId,
        type,
        title,
        message,
        ...(data !== undefined
            ? {
                data: data as Record<string, unknown>,
            }
            : {}),
    };
}

/**
 * Validate dedicated subscription email payloads.
 */
function getSubscriptionEmailPayload(
    value: Record<string, unknown>,
): SubscriptionEmailPayload {
    if (value.kind === "SUBSCRIPTION_ACTIVATED") {
        if (
            typeof value.userId !== "string" ||
            typeof value.subscriptionId !== "string" ||
            typeof value.paymentId !== "string"
        ) {
            throw new Error(
                "Subscription activation email payload is invalid.",
            );
        }

        return {
            kind: "SUBSCRIPTION_ACTIVATED",
            userId: value.userId,
            subscriptionId: value.subscriptionId,
            paymentId: value.paymentId,
        };
    }

    if (value.kind === "SUBSCRIPTION_EXPIRY_REMINDER") {
        if (
            typeof value.userId !== "string" ||
            typeof value.subscriptionId !== "string" ||
            typeof value.expiresAt !== "string"
        ) {
            throw new Error(
                "Subscription expiry reminder payload is invalid.",
            );
        }

        const expiry = new Date(value.expiresAt);

        if (Number.isNaN(expiry.getTime())) {
            throw new Error(
                "Subscription expiry reminder contains an invalid expiry date.",
            );
        }

        return {
            kind: "SUBSCRIPTION_EXPIRY_REMINDER",
            userId: value.userId,
            subscriptionId: value.subscriptionId,
            expiresAt: value.expiresAt,
        };
    }

    throw new Error(
        "Unsupported subscription email payload.",
    );
}

/**
 * Claim a batch of available jobs.
 *
 * SKIP LOCKED allows multiple workers to process jobs
 * without claiming the same row simultaneously.
 */
async function claimJobs(
    batchSize: number,
    workerId: string,
): Promise<ClaimedJob[]> {
    return db.transaction(async (tx) => {
        const jobs = await tx
            .select({
                id: notificationDeliveryJobs.id,
                userId: notificationDeliveryJobs.userId,
                channel: notificationDeliveryJobs.channel,
                payload: notificationDeliveryJobs.payload,
                attempts: notificationDeliveryJobs.attempts,
                maxAttempts: notificationDeliveryJobs.maxAttempts,
            })
            .from(notificationDeliveryJobs)
            .where(
                and(
                    eq(
                        notificationDeliveryJobs.status,
                        "PENDING",
                    ),
                    lt(
                        notificationDeliveryJobs.availableAt,
                        sql`NOW()`,
                    ),
                    lt(
                        notificationDeliveryJobs.attempts,
                        notificationDeliveryJobs.maxAttempts,
                    ),
                ),
            )
            .orderBy(
                asc(notificationDeliveryJobs.availableAt),
                asc(notificationDeliveryJobs.createdAt),
            )
            .limit(batchSize)
            .for("update", {
                skipLocked: true,
            });

        if (jobs.length === 0) {
            return [];
        }

        const jobIds = jobs.map((job) => job.id);

        await tx
            .update(notificationDeliveryJobs)
            .set({
                status: "PROCESSING",
                workerId,
                lockedAt: new Date(),
                attempts: sql`${notificationDeliveryJobs.attempts} + 1`,
                updatedAt: new Date(),
            })
            .where(
                and(
                    inArray(
                        notificationDeliveryJobs.id,
                        jobIds,
                    ),
                    eq(
                        notificationDeliveryJobs.status,
                        "PENDING",
                    ),
                ),
            );

        return jobs.map((job) => ({
            ...job,
            attempts: job.attempts + 1,
        })) as ClaimedJob[];
    });
}

/**
 * Persist an in-app notification idempotently.
 */
async function deliverInApp(
    payload: NotificationPayload,
): Promise<void> {
    const idempotencyKey =
        `${payload.eventId}:${payload.userId}:IN_APP`;

    if (idempotencyKey.length > 255) {
        throw new Error(
            "Notification idempotency key exceeds 255 characters.",
        );
    }

    await db
        .insert(notifications)
        .values({
            userId: payload.userId,
            type: payload.type as
                (typeof notifications.$inferInsert)["type"],
            title: payload.title,
            message: payload.message,
            data: payload.data ?? null,
            idempotencyKey,
        })
        .onConflictDoNothing({
            target: notifications.idempotencyKey,
        });
}

/**
 * Deliver a realtime notification to connected clients.
 */
async function deliverSocket(
    payload: NotificationPayload,
): Promise<void> {
    const socketServer = getSocketIO();

    socketServer
        .to(`user:${payload.userId}`)
        .emit("notification:new", {
            eventId: payload.eventId,
            userId: payload.userId,
            type: payload.type,
            title: payload.title,
            message: payload.message,
            data: payload.data ?? null,
        });
}

/**
 * Deliver a generic email notification.
 */
async function deliverEmail(
    payload: NotificationPayload,
): Promise<void> {
    const [user] = await db
        .select({
            email: users.email,
            firstName: users.firstName,
            status: users.status,
        })
        .from(users)
        .where(eq(users.id, payload.userId))
        .limit(1);

    if (!user || user.status !== "ACTIVE") {
        throw new Error(
            "Notification recipient is missing or inactive.",
        );
    }

    await sendNotificationEmail({
        email: user.email,
        firstName: user.firstName,
        title: payload.title,
        message: payload.message,
    });
}

/**
 * Send a subscription activation confirmation.
 *
 * Payment and subscription records are re-read from the database.
 * The email never trusts dates or prices supplied by the job payload.
 */
async function deliverSubscriptionActivatedEmail(
    payload: SubscriptionActivatedEmailPayload,
): Promise<void> {
    const [result] = await db
        .select({
            subscriptionId: subscriptions.id,
            subscriptionUserId: subscriptions.userId,
            subscriptionStatus: subscriptions.status,
            startsAt: subscriptions.startsAt,
            expiresAt: subscriptions.expiresAt,
            listingCredits: subscriptions.listingCredits,
            effectivePrice: subscriptions.effectivePrice,
            subscriptionCurrency: subscriptions.currency,

            planName: subscriptionPlans.name,

            paymentId: payments.id,
            paymentUserId: payments.userId,
            paymentStatus: payments.status,
            paymentAmount: payments.amount,
            paymentCurrency: payments.currency,
            paidAt: payments.paidAt,

            email: users.email,
            firstName: users.firstName,
            userStatus: users.status,
        })
        .from(subscriptions)
        .innerJoin(
            subscriptionPlans,
            eq(
                subscriptions.planId,
                subscriptionPlans.id,
            ),
        )
        .innerJoin(
            subscriptionPlanVersions,
            eq(
                subscriptions.planVersionId,
                subscriptionPlanVersions.id,
            ),
        )
        .innerJoin(
            payments,
            eq(
                payments.id,
                payload.paymentId,
            ),
        )
        .innerJoin(
            users,
            eq(
                users.id,
                subscriptions.userId,
            ),
        )
        .where(
            and(
                eq(
                    subscriptions.id,
                    payload.subscriptionId,
                ),
                eq(
                    subscriptions.userId,
                    payload.userId,
                ),
                eq(
                    payments.subscriptionId,
                    subscriptions.id,
                ),
            ),
        )
        .limit(1);

    if (!result) {
        throw new Error(
            "Subscription activation email records could not be found.",
        );
    }

    if (
        result.paymentUserId !== payload.userId ||
        result.paymentStatus !== "SUCCESS"
    ) {
        throw new Error(
            "Subscription activation email requires a successfully verified payment.",
        );
    }

    if (!result.startsAt || !result.expiresAt) {
        throw new Error(
            "Subscription activation dates are unavailable.",
        );
    }

    if (
        !result.paidAt ||
        result.userStatus !== "ACTIVE"
    ) {
        throw new Error(
            "Payment date is missing or the email recipient is inactive.",
        );
    }

    await sendSubscriptionActivatedEmail({
        email: result.email,
        firstName: result.firstName,
        planName: result.planName,
        amount: result.paymentAmount,
        currency: result.paymentCurrency,
        listingCredits: result.listingCredits,
        paymentDate: result.paidAt,
        activationDate: result.startsAt,
        expiryDate: result.expiresAt,
    });
}

/**
 * Deliver a three-day subscription expiry reminder.
 *
 * A reminder is discarded if the subscription has been renewed,
 * replaced, expired, or its expiry date has changed.
 */
async function deliverSubscriptionExpiryReminderEmail(
    payload: SubscriptionExpiryReminderEmailPayload,
): Promise<void> {
    const [result] = await db
        .select({
            subscriptionId: subscriptions.id,
            subscriptionUserId: subscriptions.userId,
            subscriptionStatus: subscriptions.status,
            startsAt: subscriptions.startsAt,
            expiresAt: subscriptions.expiresAt,
            listingCredits: subscriptions.listingCredits,

            planName: subscriptionPlans.name,

            email: users.email,
            firstName: users.firstName,
            userStatus: users.status,
        })
        .from(subscriptions)
        .innerJoin(
            subscriptionPlans,
            eq(
                subscriptions.planId,
                subscriptionPlans.id,
            ),
        )
        .innerJoin(
            subscriptionPlanVersions,
            eq(
                subscriptions.planVersionId,
                subscriptionPlanVersions.id,
            ),
        )
        .innerJoin(
            users,
            eq(
                users.id,
                subscriptions.userId,
            ),
        )
        .where(
            and(
                eq(
                    subscriptions.id,
                    payload.subscriptionId,
                ),
                eq(
                    subscriptions.userId,
                    payload.userId,
                ),
            ),
        )
        .limit(1);

    // Missing subscription means this reminder is no longer relevant.
    if (!result) {
        return;
    }

    if (
        result.userStatus !== "ACTIVE" ||
        !result.expiresAt
    ) {
        return;
    }

    // Both ACTIVE and CANCELLED retain access until expiry.
    if (
        result.subscriptionStatus !== "ACTIVE" &&
        result.subscriptionStatus !== "CANCELLED"
    ) {
        return;
    }

    const currentExpiry = result.expiresAt;
    const queuedExpiry = new Date(payload.expiresAt);

    // Do not send reminders for an outdated expiry date.
    if (
        currentExpiry.getTime() !== queuedExpiry.getTime()
    ) {
        return;
    }

    // Do not send reminders for subscriptions that have expired.
    if (currentExpiry.getTime() <= Date.now()) {
        return;
    }

    // A newer active subscription supersedes this reminder.
    const [newerSubscription] = await db
        .select({
            id: subscriptions.id,
        })
        .from(subscriptions)
        .where(
            and(
                eq(
                    subscriptions.userId,
                    payload.userId,
                ),
                eq(
                    subscriptions.status,
                    "ACTIVE",
                ),
                sql`${subscriptions.createdAt} > (
                    SELECT created_at
                    FROM subscriptions
                    WHERE id = ${payload.subscriptionId}
                )`,
            ),
        )
        .limit(1);

    if (newerSubscription) {
        return;
    }

    await sendSubscriptionExpiryReminderEmail({
        email: result.email,
        firstName: result.firstName,
        planName: result.planName,
        expiryDate: result.expiresAt,
        listingCredits: result.listingCredits,
    });
}

/**
 * Route dedicated subscription emails separately from generic emails.
 */
async function deliverSubscriptionEmail(
    value: Record<string, unknown>,
    jobUserId: string,
): Promise<void> {
    const payload = getSubscriptionEmailPayload(value);

    if (payload.userId !== jobUserId) {
        throw new Error(
            "Subscription email recipient does not match the delivery job.",
        );
    }

    switch (payload.kind) {
        case "SUBSCRIPTION_ACTIVATED":
            await deliverSubscriptionActivatedEmail(payload);
            return;

        case "SUBSCRIPTION_EXPIRY_REMINDER":
            await deliverSubscriptionExpiryReminderEmail(payload);
            return;

        default: {
            const unsupportedKind: never = payload;
            throw new Error(
                `Unsupported subscription email: ${unsupportedKind}`,
            );
        }
    }
}

/**
 * Web Push delivery.
 */
async function deliverPush(
    payload: NotificationPayload,
): Promise<void> {
    const results = await sendWebPushToUser(
        payload.userId,
        {
            title: payload.title,
            body: payload.message,
            notificationId: payload.eventId,
            url:
                typeof payload.data?.url === "string"
                    ? payload.data.url
                    : "/notifications",
            tag: `karmass:${payload.type}`,
            data: {
                type: payload.type,
                eventId: payload.eventId,
                ...(payload.data ?? {}),
            },
        },
    );

    if (results.length === 0) {
        return;
    }

    const transientFailures = results.filter(
        (result) =>
            !result.delivered &&
            !result.permanentlyInvalid,
    );

    if (transientFailures.length > 0) {
        throw new Error(
            `Web Push failed for ${transientFailures.length} subscription(s).`,
        );
    }
}

/**
 * Deliver one notification job.
 */
async function deliverJob(
    job: ClaimedJob,
): Promise<void> {
    // Subscription emails have their own payload format.
    // Do not pass them through the generic notification parser.
    if (
        job.channel === "EMAIL" &&
        (
            job.payload.kind === "SUBSCRIPTION_ACTIVATED" ||
            job.payload.kind === "SUBSCRIPTION_EXPIRY_REMINDER"
        )
    ) {
        await deliverSubscriptionEmail(
            job.payload,
            job.userId,
        );

        return;
    }

    const payload = getPayload(job.payload);

    if (payload.userId !== job.userId) {
        throw new Error(
            "Delivery job recipient does not match its payload.",
        );
    }

    switch (job.channel) {
        case "IN_APP":
            await deliverInApp(payload);
            return;

        case "SOCKET":
            await deliverSocket(payload);
            return;

        case "EMAIL":
            await deliverEmail(payload);
            return;

        case "PUSH":
            await deliverPush(payload);
            return;

        default: {
            const unsupportedChannel: never = job.channel;

            throw new Error(
                `Unsupported notification channel: ${unsupportedChannel}`,
            );
        }
    }
}

/**
 * Complete a successfully processed job.
 */
async function completeJob(
    jobId: string,
    workerId: string,
): Promise<void> {
    const completed = await db
        .update(notificationDeliveryJobs)
        .set({
            status: "SUCCEEDED",
            processedAt: new Date(),
            lockedAt: null,
            workerId: null,
            lastError: null,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(notificationDeliveryJobs.id, jobId),
                eq(
                    notificationDeliveryJobs.status,
                    "PROCESSING",
                ),
                eq(
                    notificationDeliveryJobs.workerId,
                    workerId,
                ),
            ),
        )
        .returning({
            id: notificationDeliveryJobs.id,
        });

    if (completed.length !== 1) {
        throw new Error(
            `Notification job ${jobId} could not be completed because the worker no longer owns its lock.`,
        );
    }
}

/**
 * Retry a failed job with exponential backoff.
 */
async function failJob(
    job: ClaimedJob,
    workerId: string,
    error: unknown,
): Promise<void> {
    const errorMessage = (
        error instanceof Error
            ? error.message
            : "Unknown notification delivery error."
    ).slice(0, 2000);

    const permanentlyFailed =
        job.attempts >= job.maxAttempts;

    const delayMs = Math.min(
        1_000 * 2 ** Math.max(job.attempts - 1, 0),
        5 * 60 * 1000,
    );

    await db
        .update(notificationDeliveryJobs)
        .set({
            status: permanentlyFailed
                ? "FAILED"
                : "PENDING",

            availableAt: permanentlyFailed
                ? new Date()
                : new Date(Date.now() + delayMs),

            lockedAt: null,
            workerId: null,
            lastError: errorMessage,
            updatedAt: new Date(),

            ...(permanentlyFailed
                ? {
                    processedAt: new Date(),
                }
                : {}),
        })
        .where(
            and(
                eq(notificationDeliveryJobs.id, job.id),
                eq(
                    notificationDeliveryJobs.status,
                    "PROCESSING",
                ),
                eq(
                    notificationDeliveryJobs.workerId,
                    workerId,
                ),
            ),
        );
}

/**
 * Recover jobs abandoned by workers that crashed or stopped.
 */
async function recoverStaleJobs(
    lockTimeoutMs: number,
): Promise<void> {
    const staleBefore = new Date(
        Date.now() - lockTimeoutMs,
    );

    await db
        .update(notificationDeliveryJobs)
        .set({
            status: "PENDING",
            workerId: null,
            lockedAt: null,
            availableAt: new Date(),
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(
                    notificationDeliveryJobs.status,
                    "PROCESSING",
                ),
                lt(
                    notificationDeliveryJobs.lockedAt,
                    staleBefore,
                ),
                lt(
                    notificationDeliveryJobs.attempts,
                    notificationDeliveryJobs.maxAttempts,
                ),
            ),
        );

    await db
        .update(notificationDeliveryJobs)
        .set({
            status: "FAILED",
            workerId: null,
            lockedAt: null,
            processedAt: new Date(),
            lastError:
                "Worker lock expired after the maximum number of attempts.",
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(
                    notificationDeliveryJobs.status,
                    "PROCESSING",
                ),
                lt(
                    notificationDeliveryJobs.lockedAt,
                    staleBefore,
                ),
                sql`${notificationDeliveryJobs.attempts} >= ${notificationDeliveryJobs.maxAttempts}`,
            ),
        );
}

/**
 * Process one batch of durable notification jobs.
 */
export async function processNotificationBatch(
    options: {
        batchSize?: number;
        lockTimeoutMs?: number;
        workerId?: string;
    } = {},
): Promise<{
    claimed: number;
    succeeded: number;
    failed: number;
}> {
    const batchSize =
        options.batchSize ?? DEFAULT_BATCH_SIZE;

    const lockTimeoutMs =
        options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;

    const workerId =
        options.workerId ?? randomUUID();

    if (
        !Number.isSafeInteger(batchSize) ||
        batchSize < 1 ||
        batchSize > 100
    ) {
        throw new Error(
            "Batch size must be between 1 and 100.",
        );
    }

    if (
        !Number.isSafeInteger(lockTimeoutMs) ||
        lockTimeoutMs < 1_000
    ) {
        throw new Error(
            "Lock timeout must be at least 1000 milliseconds.",
        );
    }

    await recoverStaleJobs(lockTimeoutMs);

    const jobs = await claimJobs(
        batchSize,
        workerId,
    );

    let succeeded = 0;
    let failed = 0;

    for (const job of jobs) {
        try {
            await deliverJob(job);

            await completeJob(
                job.id,
                workerId,
            );

            succeeded += 1;
        } catch (error) {
            try {
                await failJob(
                    job,
                    workerId,
                    error,
                );
            } catch (failureError) {
                console.error(
                    "Unable to update notification delivery job:",
                    {
                        jobId: job.id,
                        error: failureError,
                    },
                );
            }

            console.error(
                "Notification delivery failed:",
                {
                    jobId: job.id,
                    channel: job.channel,
                    attempts: job.attempts,
                    error,
                },
            );

            failed += 1;
        }
    }

    return {
        claimed: jobs.length,
        succeeded,
        failed,
    };
}

/**
 * Start polling for notification delivery jobs.
 *
 * Call this once during application startup.
 */
export function startNotificationWorker(
    options: NotificationWorkerOptions = {},
): {
    stop: () => void;
} {
    const batchSize =
        options.batchSize ?? DEFAULT_BATCH_SIZE;

    const pollIntervalMs =
        options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

    const lockTimeoutMs =
        options.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;

    const workerId =
        options.workerId ?? randomUUID();

    if (
        !Number.isSafeInteger(pollIntervalMs) ||
        pollIntervalMs < 250
    ) {
        throw new Error(
            "Poll interval must be at least 250 milliseconds.",
        );
    }

    if (
        !Number.isSafeInteger(batchSize) ||
        batchSize < 1 ||
        batchSize > 100
    ) {
        throw new Error(
            "Batch size must be between 1 and 100.",
        );
    }

    if (
        !Number.isSafeInteger(lockTimeoutMs) ||
        lockTimeoutMs < 1_000
    ) {
        throw new Error(
            "Lock timeout must be at least 1000 milliseconds.",
        );
    }

    if (
        workerId.trim().length === 0 ||
        workerId.length > 150
    ) {
        throw new Error(
            "Worker ID must contain between 1 and 150 characters.",
        );
    }

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll(): Promise<void> {
        if (stopped) {
            return;
        }

        try {
            await processNotificationBatch({
                batchSize,
                lockTimeoutMs,
                workerId,
            });
        } catch (error) {
            console.error(
                "Notification worker encountered an error:",
                error,
            );
        }

        if (!stopped) {
            timer = setTimeout(() => {
                void poll();
            }, pollIntervalMs);
        }
    }

    void poll();

    return {
        stop() {
            stopped = true;

            if (timer) {
                clearTimeout(timer);
            }
        },
    };
}