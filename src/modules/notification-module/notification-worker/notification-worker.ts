import {
    and,
    asc,
    eq,
    inArray,
    lt,
    lte,
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
    listingBoosts,
    listings,
    boostPlans,
} from "../../../database/schema/index.ts";

import { getSocketIO } from "../../../realtime/socket.ts";

import {
    sendNotificationEmail,
    sendSubscriptionActivatedEmail,
    sendSubscriptionExpiryReminderEmail,
    sendAdminBoostPaymentReceivedEmail,
    sendBoostExpiryReminderEmail,
} from "../../email-module/email.service.ts";

import { sendWebPushToUser } from "../web-push/web-push.service.ts";
import { alias } from "drizzle-orm/pg-core";

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_LOCK_TIMEOUT_MS = 60_000;

export interface NotificationWorkerOptions {
    batchSize?: number;
    pollIntervalMs?: number;
    lockTimeoutMs?: number;
    workerId?: string;
}

/*
|--------------------------------------------------------------------------
| TYPES
|--------------------------------------------------------------------------
*/

interface NotificationPayload {
    eventId: string;
    userId: string;
    type: string;
    title: string;
    message: string;
    data?: Record<string, unknown>;
}

interface AdminBoostPaymentEmailPayload {
    kind: "ADMIN_BOOST_PAYMENT_RECEIVED";
    userId: string;
    listingBoostId: string;
    paymentId: string;
}

interface BoostExpiryReminderEmailPayload {
    kind: "BOOST_EXPIRY_REMINDER";
    userId: string;
    listingBoostId: string;
    listingId: string;
    expiresAt: string;
}

type BoostEmailPayload =
    | AdminBoostPaymentEmailPayload
    | BoostExpiryReminderEmailPayload;

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

/*
|--------------------------------------------------------------------------
| GENERIC NOTIFICATION PAYLOAD VALIDATION
|--------------------------------------------------------------------------
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

/*
|--------------------------------------------------------------------------
| SUBSCRIPTION EMAIL PAYLOAD VALIDATION
|--------------------------------------------------------------------------
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

/*
|--------------------------------------------------------------------------
| BOOST EMAIL PAYLOAD VALIDATION
|--------------------------------------------------------------------------
*/

function getBoostEmailPayload(
    value: Record<string, unknown>,
): BoostEmailPayload {
    if (value.kind === "ADMIN_BOOST_PAYMENT_RECEIVED") {
        if (
            typeof value.userId !== "string" ||
            typeof value.listingBoostId !== "string" ||
            typeof value.paymentId !== "string"
        ) {
            throw new Error(
                "Admin boost payment email payload is invalid.",
            );
        }

        return {
            kind: "ADMIN_BOOST_PAYMENT_RECEIVED",
            userId: value.userId,
            listingBoostId: value.listingBoostId,
            paymentId: value.paymentId,
        };
    }

    if (value.kind === "BOOST_EXPIRY_REMINDER") {
        if (
            typeof value.userId !== "string" ||
            typeof value.listingBoostId !== "string" ||
            typeof value.listingId !== "string" ||
            typeof value.expiresAt !== "string"
        ) {
            throw new Error(
                "Boost expiry reminder payload is invalid.",
            );
        }

        const expiry = new Date(value.expiresAt);

        if (Number.isNaN(expiry.getTime())) {
            throw new Error(
                "Boost expiry reminder contains an invalid expiry date.",
            );
        }

        return {
            kind: "BOOST_EXPIRY_REMINDER",
            userId: value.userId,
            listingBoostId: value.listingBoostId,
            listingId: value.listingId,
            expiresAt: value.expiresAt,
        };
    }

    throw new Error(
        "Unsupported boost email payload.",
    );
}

/*
|--------------------------------------------------------------------------
| ADMIN BOOST PAYMENT EMAIL
|--------------------------------------------------------------------------
|
| Revalidate the payment and boost before sending.
|
| The recipient is the administrator identified by the
| notification delivery job, not an arbitrary email address
| supplied through the payload.
*/

async function deliverAdminBoostPaymentEmail(
    payload: AdminBoostPaymentEmailPayload,
): Promise<void> {
    const buyer = alias(users, "buyer");

    const [result] = await db
        .select({
            adminId: users.id,
            adminEmail: users.email,
            adminFirstName: users.firstName,
            adminStatus: users.status,

            paymentId: payments.id,
            paymentUserId: payments.userId,
            paymentStatus: payments.status,
            paymentAmount: payments.amount,
            paymentCurrency: payments.currency,
            paymentPaidAt: payments.paidAt,
            paymentBoostId: payments.listingBoostId,

            boostId: listingBoosts.id,
            boostStatus: listingBoosts.status,

            listingId: listings.id,
            listingTitle: listings.title,
            listingSellerId: listings.sellerId,

            buyerEmail: buyer.email,
            buyerFirstName: buyer.firstName,
            buyerLastName: buyer.lastName,

            planDurationDays: boostPlans.durationDays,
        })
        .from(users)
        .innerJoin(
            payments,
            eq(payments.id, payload.paymentId),
        )
        .innerJoin(
            listingBoosts,
            eq(listingBoosts.id, payload.listingBoostId),
        )
        .innerJoin(
            listings,
            eq(listings.id, listingBoosts.listingId),
        )
        .innerJoin(
            boostPlans,
            eq(boostPlans.id, listingBoosts.boostPlanId),
        )
        .innerJoin(
            buyer,
            eq(buyer.id, payments.userId),
        )
        .where(
            and(
                eq(users.id, payload.userId),
                eq(payments.id, payload.paymentId),
                eq(payments.listingBoostId, payload.listingBoostId),
            ),
        )
        .limit(1);

    if (!result) {
        throw new Error(
            "Administrator boost payment email records could not be found.",
        );
    }

    if (result.adminStatus !== "ACTIVE") {
        return;
    }

    if (
        !result.adminEmail ||
        !result.buyerEmail
    ) {
        throw new Error(
            "Administrator or buyer email address is unavailable.",
        );
    }

    if (
        result.paymentStatus !== "SUCCESS" ||
        result.paymentUserId !== result.listingSellerId ||
        result.paymentBoostId !== result.boostId
    ) {
        throw new Error(
            "Administrator boost email requires a successfully verified payment.",
        );
    }

    if (!result.paymentPaidAt) {
        throw new Error(
            "Boost payment confirmation date is unavailable.",
        );
    }

    await sendAdminBoostPaymentReceivedEmail({
        email: result.adminEmail,
        firstName: result.adminFirstName,

        buyerName: [
            result.buyerFirstName,
            result.buyerLastName,
        ].filter(Boolean).join(" "),

        buyerEmail: result.buyerEmail,

        listingTitle: result.listingTitle,
        listingId: result.listingId,

        boostId: result.boostId,
        durationDays: result.planDurationDays,
        planName: `${result.planDurationDays}-Day Boost`,

        amount: result.paymentAmount,
        currency: result.paymentCurrency,

        paymentDate: result.paymentPaidAt,
        paymentId: result.paymentId,
    });
}

/*
|--------------------------------------------------------------------------
| BOOST EXPIRY REMINDER EMAIL
|--------------------------------------------------------------------------
|
| Only send when:
|
| 1. The boost still exists.
| 2. It is ACTIVE.
| 3. Its expiry date has not changed.
| 4. The owner is still active.
| 5. The boost has not expired.
*/

async function deliverBoostExpiryReminderEmail(
    payload: BoostExpiryReminderEmailPayload,
): Promise<void> {
    const [result] = await db
        .select({
            boostId: listingBoosts.id,
            boostStatus: listingBoosts.status,
            boostExpiresAt: listingBoosts.expiresAt,

            listingId: listings.id,
            listingTitle: listings.title,

            email: users.email,
            firstName: users.firstName,
            userStatus: users.status,
        })
        .from(listingBoosts)
        .innerJoin(
            listings,
            eq(
                listingBoosts.listingId,
                listings.id,
            ),
        )
        .innerJoin(
            users,
            eq(
                listings.sellerId,
                users.id,
            ),
        )
        .where(
            and(
                eq(
                    listingBoosts.id,
                    payload.listingBoostId,
                ),
                eq(
                    listingBoosts.listingId,
                    payload.listingId,
                ),
                eq(
                    listings.sellerId,
                    payload.userId,
                ),
            ),
        )
        .limit(1);

    if (!result) {
        return;
    }

    if (
        result.boostStatus !== "ACTIVE" ||
        !result.boostExpiresAt
    ) {
        return;
    }

    if (result.userStatus !== "ACTIVE") {
        return;
    }

    const queuedExpiry = new Date(
        payload.expiresAt,
    );

    if (
        result.boostExpiresAt.getTime() !==
        queuedExpiry.getTime()
    ) {
        return;
    }

    if (
        result.boostExpiresAt.getTime() <= Date.now()
    ) {
        return;
    }

    await sendBoostExpiryReminderEmail({
        email: result.email,
        firstName: result.firstName,
        listingTitle: result.listingTitle,
        expiryDate: result.boostExpiresAt,
        listingId: result.listingId,
    });
}

/*
|--------------------------------------------------------------------------
| CLAIM AVAILABLE JOBS
|--------------------------------------------------------------------------
|
| SKIP LOCKED allows multiple workers to process jobs safely.
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
                    lte(
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

        const jobIds = jobs.map(
            (job) => job.id,
        );

        const now = new Date();

        await tx
            .update(notificationDeliveryJobs)
            .set({
                status: "PROCESSING",
                workerId,
                lockedAt: now,
                attempts: sql`${notificationDeliveryJobs.attempts} + 1`,
                updatedAt: now,
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

/*
|--------------------------------------------------------------------------
| IN-APP NOTIFICATION DELIVERY
|--------------------------------------------------------------------------
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

/*
|--------------------------------------------------------------------------
| SOCKET NOTIFICATION DELIVERY
|--------------------------------------------------------------------------
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

/*
|--------------------------------------------------------------------------
| GENERIC EMAIL DELIVERY
|--------------------------------------------------------------------------
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
        .where(
            eq(
                users.id,
                payload.userId,
            ),
        )
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

/*
|--------------------------------------------------------------------------
| SUBSCRIPTION ACTIVATION EMAIL
|--------------------------------------------------------------------------
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

    if (
        !result.startsAt ||
        !result.expiresAt
    ) {
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

/*
|--------------------------------------------------------------------------
| SUBSCRIPTION EXPIRY REMINDER EMAIL
|--------------------------------------------------------------------------
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

    if (!result) {
        return;
    }

    if (
        result.userStatus !== "ACTIVE" ||
        !result.expiresAt
    ) {
        return;
    }

    if (
        result.subscriptionStatus !== "ACTIVE" &&
        result.subscriptionStatus !== "CANCELLED"
    ) {
        return;
    }

    const currentExpiry = result.expiresAt;

    const queuedExpiry = new Date(
        payload.expiresAt,
    );

    if (
        currentExpiry.getTime() !==
        queuedExpiry.getTime()
    ) {
        return;
    }

    if (
        currentExpiry.getTime() <= Date.now()
    ) {
        return;
    }

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

/*
|--------------------------------------------------------------------------
| SUBSCRIPTION EMAIL ROUTER
|--------------------------------------------------------------------------
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
            await deliverSubscriptionActivatedEmail(
                payload,
            );
            return;

        case "SUBSCRIPTION_EXPIRY_REMINDER":
            await deliverSubscriptionExpiryReminderEmail(
                payload,
            );
            return;

        default: {
            const unsupportedKind: never = payload;

            throw new Error(
                `Unsupported subscription email: ${unsupportedKind}`,
            );
        }
    }
}

/*
|--------------------------------------------------------------------------
| BOOST EMAIL ROUTER
|--------------------------------------------------------------------------
*/

async function deliverBoostEmail(
    value: Record<string, unknown>,
    jobUserId: string,
): Promise<void> {
    const payload = getBoostEmailPayload(value);

    if (payload.userId !== jobUserId) {
        throw new Error(
            "Boost email recipient does not match the delivery job.",
        );
    }

    switch (payload.kind) {
        case "ADMIN_BOOST_PAYMENT_RECEIVED":
            await deliverAdminBoostPaymentEmail(
                payload,
            );
            return;

        case "BOOST_EXPIRY_REMINDER":
            await deliverBoostExpiryReminderEmail(
                payload,
            );
            return;

        default: {
            const unsupportedKind: never = payload;

            throw new Error(
                `Unsupported boost email: ${unsupportedKind}`,
            );
        }
    }
}

/*
|--------------------------------------------------------------------------
| WEB PUSH DELIVERY
|--------------------------------------------------------------------------
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

/*
|--------------------------------------------------------------------------
| JOB DELIVERY ROUTER
|--------------------------------------------------------------------------
|
| Dedicated email payloads must be routed before the generic
| notification payload validator.
*/

async function deliverJob(
    job: ClaimedJob,
): Promise<void> {
    if (job.channel === "EMAIL") {
        if (
            job.payload.kind === "SUBSCRIPTION_ACTIVATED" ||
            job.payload.kind === "SUBSCRIPTION_EXPIRY_REMINDER"
        ) {
            await deliverSubscriptionEmail(
                job.payload,
                job.userId,
            );

            return;
        }

        if (
            job.payload.kind === "ADMIN_BOOST_PAYMENT_RECEIVED" ||
            job.payload.kind === "BOOST_EXPIRY_REMINDER"
        ) {
            await deliverBoostEmail(
                job.payload,
                job.userId,
            );

            return;
        }
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

/*
|--------------------------------------------------------------------------
| COMPLETE JOB
|--------------------------------------------------------------------------
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
                eq(
                    notificationDeliveryJobs.id,
                    jobId,
                ),
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

/*
|--------------------------------------------------------------------------
| FAILED JOB / RETRY
|--------------------------------------------------------------------------
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
        1_000 * 2 ** Math.max(
            job.attempts - 1,
            0,
        ),
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
                : new Date(
                    Date.now() + delayMs,
                ),

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
                eq(
                    notificationDeliveryJobs.id,
                    job.id,
                ),
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

/*
|--------------------------------------------------------------------------
| STALE JOB RECOVERY
|--------------------------------------------------------------------------
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
                sql`
                    ${notificationDeliveryJobs.attempts}
                    >=
                    ${notificationDeliveryJobs.maxAttempts}
                `,
            ),
        );
}

/*
|--------------------------------------------------------------------------
| PROCESS NOTIFICATION BATCH
|--------------------------------------------------------------------------
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

    await recoverStaleJobs(
        lockTimeoutMs,
    );

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

/*
|--------------------------------------------------------------------------
| START NOTIFICATION WORKER
|--------------------------------------------------------------------------
|
| Call once during application startup.
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

    let timer:
        | ReturnType<typeof setTimeout>
        | undefined;

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
            timer = setTimeout(
                () => {
                    void poll();
                },
                pollIntervalMs,
            );
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