import {
    and,
    desc,
    eq,
    gt,
    isNull,
    lt,
    or,
    sql,
} from "drizzle-orm";

import { db } from "../../database/index.ts";

import {
    dealerProfiles,
    subscriptionHistory,
    subscriptionHistoryEventEnum,
    subscriptionPlanVersions,
    subscriptionPlans,
    subscriptionStatusEnum,
    subscriptions,
    users,
} from "../../database/schema/index.ts";

import { AppError } from "../../errors/app-error.ts";

import {
    CREDIT_REASONS,
    consumeCreditUsingExecutor,
    getCreditBalanceUsingExecutor,
    grantCredits,
    type CreditReason,
} from "../credits/credit.service.ts";

/*
 * ============================================================
 * TYPES
 * ============================================================
 */

type DatabaseTransaction = Parameters<
    Parameters<typeof db.transaction>[0]
>[0];

type DatabaseExecutor =
    | typeof db
    | DatabaseTransaction;

type SubscriptionStatus =
    (typeof subscriptionStatusEnum.enumValues)[number];

type SubscriptionHistoryEvent =
    (typeof subscriptionHistoryEventEnum.enumValues)[number];

interface CreatePendingSubscriptionInput {
    userId: string;
    planId: string;
}

interface SubscriptionPrice {
    planId: string;
    planVersionId: string;
    planName: string;
    version: number;
    originalPrice: string;
    dealerDiscountPercent: string;
    effectivePrice: string;
    currency: string;
    durationDays: number;
    listingCredits: number;
    isDealer: boolean;
}

/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

function calculateEffectivePrice(
    originalPrice: string,
    dealerDiscountPercent: string,
): string {
    const original = Number(originalPrice);
    const discount = Number(dealerDiscountPercent);

    if (
        !Number.isFinite(original) ||
        !Number.isFinite(discount) ||
        original < 0 ||
        discount < 0 ||
        discount > 100
    ) {
        throw new AppError(
            "Invalid subscription pricing configuration.",
            500,
            "INVALID_SUBSCRIPTION_PRICE",
        );
    }

    const effective =
        original - (original * discount) / 100;

    return effective.toFixed(2);
}

function calculateExpiry(
    startsAt: Date,
    durationDays: number,
): Date {
    const expiresAt = new Date(startsAt.getTime());

    expiresAt.setUTCDate(
        expiresAt.getUTCDate() + durationDays,
    );

    return expiresAt;
}

async function getUserDealerDiscountEligibility(
    executor: DatabaseExecutor,
    userId: string,
): Promise<boolean> {
    const result = await executor
        .select({
            accountType: users.accountType,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    const user = result[0];

    if (!user) {
        throw new AppError(
            "User not found.",
            404,
            "USER_NOT_FOUND",
        );
    }

    if (user.accountType !== "DEALER") {
        return false;
    }

    const verifiedProfile = await executor
        .select({
            id: dealerProfiles.id,
        })
        .from(dealerProfiles)
        .where(
            and(
                eq(dealerProfiles.userId, userId),
                eq(dealerProfiles.verified, true),
            ),
        )
        .limit(1);

    return verifiedProfile.length > 0;
}

async function getLatestActivePlanVersion(
    executor: DatabaseExecutor,
    planId: string,
) {
    const result = await executor
        .select({
            plan: subscriptionPlans,
            version: subscriptionPlanVersions,
        })
        .from(subscriptionPlanVersions)
        .innerJoin(
            subscriptionPlans,
            eq(
                subscriptionPlanVersions.planId,
                subscriptionPlans.id,
            ),
        )
        .where(
            and(
                eq(
                    subscriptionPlanVersions.planId,
                    planId,
                ),
                eq(
                    subscriptionPlanVersions.active,
                    true,
                ),
                eq(
                    subscriptionPlans.active,
                    true,
                ),
            ),
        )
        .orderBy(
            desc(subscriptionPlanVersions.version),
        )
        .limit(1);

    const row = result[0];

    if (!row) {
        throw new AppError(
            "Subscription plan is not available.",
            404,
            "SUBSCRIPTION_PLAN_NOT_AVAILABLE",
        );
    }

    return row;
}

async function getPendingSubscription(
    executor: DatabaseExecutor,
    userId: string,
) {
    const result = await executor
        .select()
        .from(subscriptions)
        .where(
            and(
                eq(subscriptions.userId, userId),
                eq(subscriptions.status, "PENDING"),
            ),
        )
        .limit(1);

    return result[0];
}

async function getActiveSubscriptionForUser(
    executor: DatabaseExecutor,
    userId: string,
) {
    const now = new Date();

    const result = await executor
        .select()
        .from(subscriptions)
        .where(
            and(
                eq(subscriptions.userId, userId),
                or(
                    eq(subscriptions.status, "ACTIVE"),
                    eq(subscriptions.status, "CANCELLED"),
                ),
                or(
                    isNull(subscriptions.expiresAt),
                    gt(subscriptions.expiresAt, now),
                ),
            ),
        )
        .orderBy(desc(subscriptions.expiresAt))
        .limit(1);

    return result[0];
}

async function writeSubscriptionHistory(
    executor: DatabaseExecutor,
    input: {
        subscriptionId: string;
        userId: string;
        event: SubscriptionHistoryEvent;
        previousStatus?: SubscriptionStatus;
        newStatus?: SubscriptionStatus;
        amount?: string;
        currency?: string;
        referenceId?: string;
        reason?: string;
        metadata?: string;
        createdBy?: string;
    },
) {
    const values: typeof subscriptionHistory.$inferInsert = {
        subscriptionId: input.subscriptionId,
        userId: input.userId,
        event: input.event,
    };

    if (input.previousStatus !== undefined) {
        values.previousStatus = input.previousStatus;
    }

    if (input.newStatus !== undefined) {
        values.newStatus = input.newStatus;
    }

    if (input.amount !== undefined) {
        values.amount = input.amount;
    }

    if (input.currency !== undefined) {
        values.currency = input.currency;
    }

    if (input.referenceId !== undefined) {
        values.referenceId = input.referenceId;
    }

    if (input.reason !== undefined) {
        values.reason = input.reason;
    }

    if (input.metadata !== undefined) {
        values.metadata = input.metadata;
    }

    if (input.createdBy !== undefined) {
        values.createdBy = input.createdBy;
    }

    await executor
        .insert(subscriptionHistory)
        .values(values);
}

/*
 * ============================================================
 * CREDIT BALANCE
 * ============================================================
 *
 * The credit ledger is managed by the centralized credit service.
 */

export async function getCreditBalance(
    userId: string,
): Promise<number> {
    return getCreditBalanceUsingExecutor(db, userId);
}

/*
 * ============================================================
 * ADD CREDITS
 * ============================================================
 *
 * Compatibility wrapper for existing callers.
 *
 * Credits must have a stable reference ID so the centralized
 * credit service can enforce idempotency.
 *
 * When an executor is supplied, the credit grant participates
 * in that executor's transaction.
 */

export async function addCredits(
    userId: string,
    amount: number,
    reason: CreditReason,
    referenceId: string,
    executor?: DatabaseTransaction,
): Promise<number> {
    const input = {
        userId,
        amount,
        reason,
        referenceId,
    };

    const result = executor
        ? await grantCredits(input, executor)
        : await grantCredits(input);

    return result.balance;
}

/*
 * ============================================================
 * CONSUME CREDIT
 * ============================================================
 *
 * This operation uses the centralized credit service.
 *
 * A reference ID is mandatory so retrying the same operation
 * cannot accidentally consume the same credit more than once.
 *
 * For listing creation, use the listing ID as referenceId.
 */

export async function consumeCredit(
    userId: string,
    reason: CreditReason = CREDIT_REASONS.LISTING_CREATED,
    referenceId?: string,
) {
    if (!referenceId) {
        throw new AppError(
            "A reference ID is required to consume credits.",
            400,
            "CREDIT_REFERENCE_REQUIRED",
        );
    }

    return db.transaction(async (tx) => {
        return consumeCreditUsingExecutor(
            tx,
            {
                userId,
                reason,
                referenceId,
            },
        );
    });
}

/*
 * ============================================================
 * PLAN PRICE
 * ============================================================
 */

export async function getSubscriptionPlanPrice(
    userId: string,
    planId: string,
): Promise<SubscriptionPrice> {
    const isDealer =
        await getUserDealerDiscountEligibility(
            db,
            userId,
        );

    const row = await getLatestActivePlanVersion(
        db,
        planId,
    );

    const dealerDiscountPercent = isDealer
        ? row.version.dealerDiscountPercent
        : "0.00";

    const effectivePrice = calculateEffectivePrice(
        row.version.price,
        dealerDiscountPercent,
    );

    return {
        planId: row.plan.id,
        planVersionId: row.version.id,
        planName: row.plan.name,
        version: row.version.version,
        originalPrice: row.version.price,
        dealerDiscountPercent,
        effectivePrice,
        currency: row.version.currency,
        durationDays: row.version.durationDays,
        listingCredits: row.version.listingCredits,
        isDealer,
    };
}

/*
 * ============================================================
 * CREATE PENDING SUBSCRIPTION
 * ============================================================
 *
 * This does NOT activate the subscription.
 *
 * Confirmed payment success is what activates it.
 */

export async function createPendingSubscriptionInTransaction(
    input: CreatePendingSubscriptionInput,
    tx: DatabaseTransaction,
) {
    /*
     * Serialize subscription creation for this user.
     */
    await tx.execute(
        sql`
            SELECT pg_advisory_xact_lock(
                hashtext(
                    ${`karmass:subscription:${input.userId}`}
                )
            )
        `,
    );

    const isDealer = await getUserDealerDiscountEligibility(
        tx,
        input.userId,
    );

    const plan = await getLatestActivePlanVersion(
        tx,
        input.planId,
    );

    const existingActive =
        await getActiveSubscriptionForUser(
            tx,
            input.userId,
        );

    if (existingActive) {
        throw new AppError(
            "You already have an active subscription.",
            409,
            "ACTIVE_SUBSCRIPTION_EXISTS",
        );
    }

    const existingPending =
        await getPendingSubscription(
            tx,
            input.userId,
        );

    if (existingPending) {
        /*
         * Reuse the pending subscription when it targets
         * the same plan version.
         */
        if (
            existingPending.planId === plan.plan.id &&
            existingPending.planVersionId ===
                plan.version.id
        ) {
            return existingPending;
        }

        throw new AppError(
            "You already have a pending subscription for another plan.",
            409,
            "PENDING_SUBSCRIPTION_EXISTS",
        );
    }

    const discount = isDealer
        ? plan.version.dealerDiscountPercent
        : "0.00";

    const effectivePrice = calculateEffectivePrice(
        plan.version.price,
        discount,
    );

    const inserted = await tx
        .insert(subscriptions)
        .values({
            userId: input.userId,
            planId: plan.plan.id,
            planVersionId: plan.version.id,
            status: "PENDING",
            originalPrice: plan.version.price,
            dealerDiscountPercent: discount,
            effectivePrice,
            currency: plan.version.currency,
            durationDays: plan.version.durationDays,
            listingCredits: plan.version.listingCredits,
        })
        .returning();

    const subscription = inserted[0];

    if (!subscription) {
        throw new AppError(
            "Unable to create subscription.",
            500,
            "SUBSCRIPTION_CREATE_FAILED",
        );
    }

    await writeSubscriptionHistory(tx, {
        subscriptionId: subscription.id,
        userId: input.userId,
        event: "CREATED",
        newStatus: "PENDING",
        amount: effectivePrice,
        currency: plan.version.currency,
    });

    return subscription;
}

export async function createPendingSubscription(
    input: CreatePendingSubscriptionInput,
) {
    return db.transaction(async (tx) => {
        return createPendingSubscriptionInTransaction(
            input,
            tx,
        );
    });
}

/*
 * ============================================================
 * GET ACTIVE SUBSCRIPTION
 * ============================================================
 */

export async function getActiveSubscription(
    userId: string,
) {
    const subscription =
        await getActiveSubscriptionForUser(
            db,
            userId,
        );

    return subscription ?? null;
}

/*
 * ============================================================
 * GET CURRENT SUBSCRIPTION
 * ============================================================
 *
 * Returns the active subscription if one exists.
 * Otherwise, returns a pending subscription if present.
 */

export async function getCurrentSubscription(
    userId: string,
) {
    const active = await getActiveSubscription(
        userId,
    );

    if (active) {
        return active;
    }

    return getPendingSubscription(
        db,
        userId,
    );
}

/*
 * ============================================================
 * ACTIVATE SUBSCRIPTION
 * ============================================================
 *
 * Called after confirmed payment success.
 *
 * Subscription activation, credit granting, and history writes
 * all participate in the same database transaction.
 */

async function activateSubscriptionWithExecutor(
    subscriptionId: string,
    paymentReference: string | undefined,
    tx: DatabaseTransaction,
) {
    const result = await tx
        .select()
        .from(subscriptions)
        .where(
            eq(
                subscriptions.id,
                subscriptionId,
            ),
        )
        .limit(1);

    const subscription = result[0];

    if (!subscription) {
        throw new AppError(
            "Subscription not found.",
            404,
            "SUBSCRIPTION_NOT_FOUND",
        );
    }

    /*
     * Preserve retry safety: an already-active subscription
     * must not receive another credit grant.
     */
    if (subscription.status === "ACTIVE") {
        return subscription;
    }

    if (subscription.status !== "PENDING") {
        throw new AppError(
            "Only pending subscriptions can be activated.",
            409,
            "SUBSCRIPTION_NOT_PENDING",
        );
    }

    /*
     * Serialize activation for this user's subscriptions.
     */
    await tx.execute(
        sql`
            SELECT pg_advisory_xact_lock(
                hashtext(
                    ${`karmass:subscription:${subscription.userId}`}
                )
            )
        `,
    );

    /*
     * Re-read after acquiring the lock. Another transaction
     * may have activated this subscription while we waited.
     */
    const refreshedResult = await tx
        .select()
        .from(subscriptions)
        .where(
            eq(
                subscriptions.id,
                subscriptionId,
            ),
        )
        .limit(1);

    const refreshedSubscription =
        refreshedResult[0];

    if (!refreshedSubscription) {
        throw new AppError(
            "Subscription not found.",
            404,
            "SUBSCRIPTION_NOT_FOUND",
        );
    }

    if (refreshedSubscription.status === "ACTIVE") {
        return refreshedSubscription;
    }

    if (refreshedSubscription.status !== "PENDING") {
        throw new AppError(
            "Only pending subscriptions can be activated.",
            409,
            "SUBSCRIPTION_NOT_PENDING",
        );
    }

    const existingActive =
        await getActiveSubscriptionForUser(
            tx,
            refreshedSubscription.userId,
        );

    if (
        existingActive &&
        existingActive.id !==
            refreshedSubscription.id
    ) {
        throw new AppError(
            "User already has an active subscription.",
            409,
            "ACTIVE_SUBSCRIPTION_EXISTS",
        );
    }

    const startsAt = new Date();

    const expiresAt = calculateExpiry(
        startsAt,
        refreshedSubscription.durationDays,
    );

    const updated = await tx
        .update(subscriptions)
        .set({
            status: "ACTIVE",
            startsAt,
            expiresAt,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(
                    subscriptions.id,
                    refreshedSubscription.id,
                ),
                eq(
                    subscriptions.status,
                    "PENDING",
                ),
            ),
        )
        .returning();

    const activated = updated[0];

    if (!activated) {
        throw new AppError(
            "Subscription activation failed.",
            409,
            "SUBSCRIPTION_ACTIVATION_FAILED",
        );
    }

    await writeSubscriptionHistory(tx, {
        subscriptionId: activated.id,
        userId: activated.userId,
        event: "PAYMENT_SUCCESS",
        previousStatus: "PENDING",
        newStatus: "ACTIVE",
        amount: activated.effectivePrice,
        currency: activated.currency,
        ...(paymentReference !== undefined
            ? {
                  reason: "Payment confirmed.",
                  metadata: JSON.stringify({
                      paymentReference,
                  }),
              }
            : {}),
    });

    await writeSubscriptionHistory(tx, {
        subscriptionId: activated.id,
        userId: activated.userId,
        event: "ACTIVATED",
        previousStatus: "PENDING",
        newStatus: "ACTIVE",
        amount: activated.effectivePrice,
        currency: activated.currency,
    });

    /*
     * Grant subscription credits through the centralized
     * credit service.
     *
     * The subscription ID is the stable reference. The unique
     * user/reason/reference constraint makes the grant
     * idempotent.
     */
    await grantCredits(
        {
            userId: activated.userId,
            amount: activated.listingCredits,
            reason: CREDIT_REASONS.SUBSCRIPTION_CREDIT,
            referenceId: activated.id,
        },
        tx,
    );

    await writeSubscriptionHistory(tx, {
        subscriptionId: activated.id,
        userId: activated.userId,
        event: "CREDIT_GRANTED",
        newStatus: "ACTIVE",
        amount: activated.effectivePrice,
        currency: activated.currency,
        referenceId: activated.id,
        reason: `${activated.listingCredits} listing credits granted.`,
    });

    return activated;
}

export async function activateSubscriptionInTransaction(
    subscriptionId: string,
    paymentReference: string | undefined,
    tx: DatabaseTransaction,
) {
    return activateSubscriptionWithExecutor(
        subscriptionId,
        paymentReference,
        tx,
    );
}

export async function activateSubscription(
    subscriptionId: string,
    paymentReference?: string,
) {
    return db.transaction(async (tx) => {
        return activateSubscriptionWithExecutor(
            subscriptionId,
            paymentReference,
            tx,
        );
    });
}

/*
 * ============================================================
 * CANCEL SUBSCRIPTION
 * ============================================================
 *
 * Cancellation stops the subscription from renewing.
 *
 * It does not retroactively remove the remaining paid period.
 */

export async function cancelSubscription(
    userId: string,
    reason?: string,
) {
    return db.transaction(async (tx) => {
        const subscription =
            await getActiveSubscriptionForUser(
                tx,
                userId,
            );

        if (!subscription) {
            throw new AppError(
                "No active subscription found.",
                404,
                "ACTIVE_SUBSCRIPTION_NOT_FOUND",
            );
        }

        const cancelledAt = new Date();

        const updated = await tx
            .update(subscriptions)
            .set({
                status: "CANCELLED",
                cancelledAt,
                cancellationReason:
                    reason ?? "Cancelled by user.",
                updatedAt: cancelledAt,
            })
            .where(
                and(
                    eq(
                        subscriptions.id,
                        subscription.id,
                    ),
                    eq(
                        subscriptions.status,
                        "ACTIVE",
                    ),
                ),
            )
            .returning();

        const cancelled = updated[0];

        if (!cancelled) {
            throw new AppError(
                "Subscription cancellation failed.",
                409,
                "SUBSCRIPTION_CANCELLATION_FAILED",
            );
        }

        await writeSubscriptionHistory(tx, {
            subscriptionId: cancelled.id,
            userId: cancelled.userId,
            event: "CANCELLED",
            previousStatus: "ACTIVE",
            newStatus: "CANCELLED",
            amount: cancelled.effectivePrice,
            currency: cancelled.currency,
            reason: reason ?? "Cancelled by user.",
        });

        return cancelled;
    });
}

/*
 * ============================================================
 * EXPIRE SUBSCRIPTION
 * ============================================================
 */

export async function expireSubscription(
    subscriptionId: string,
) {
    return db.transaction(async (tx) => {
        const result = await tx
            .select()
            .from(subscriptions)
            .where(
                eq(
                    subscriptions.id,
                    subscriptionId,
                ),
            )
            .limit(1);

        const subscription = result[0];

        if (!subscription) {
            throw new AppError(
                "Subscription not found.",
                404,
                "SUBSCRIPTION_NOT_FOUND",
            );
        }

        /*
         * Expiration is only applicable to subscriptions
         * that are currently active or cancelled.
         */
        if (
            subscription.status !== "ACTIVE" &&
            subscription.status !== "CANCELLED"
        ) {
            return subscription;
        }

        const now = new Date();

        /*
         * A subscription without an expiry date, or one
         * whose expiry date is still in the future, must
         * not be expired.
         */
        if (
            !subscription.expiresAt ||
            subscription.expiresAt > now
        ) {
            throw new AppError(
                "Subscription has not expired yet.",
                409,
                "SUBSCRIPTION_NOT_EXPIRED",
            );
        }

        const previousStatus = subscription.status;

        const updated = await tx
            .update(subscriptions)
            .set({
                status: "EXPIRED",
                updatedAt: now,
            })
            .where(
                and(
                    eq(
                        subscriptions.id,
                        subscription.id,
                    ),
                    eq(
                        subscriptions.status,
                        previousStatus,
                    ),
                    lt(
                        subscriptions.expiresAt,
                        now,
                    ),
                ),
            )
            .returning();

        const expired = updated[0];

        if (!expired) {
            throw new AppError(
                "Subscription expiration failed.",
                409,
                "SUBSCRIPTION_EXPIRATION_FAILED",
            );
        }

        await writeSubscriptionHistory(tx, {
            subscriptionId: expired.id,
            userId: expired.userId,
            event: "EXPIRED",
            previousStatus,
            newStatus: "EXPIRED",
            amount: expired.effectivePrice,
            currency: expired.currency,
            reason:
                previousStatus === "CANCELLED"
                    ? "Cancelled subscription period expired."
                    : "Subscription period expired.",
        });

        /*
         * Intentionally do not remove or modify credits.
         * Credits remain in the centralized credit ledger.
         */

        return expired;
    });
}