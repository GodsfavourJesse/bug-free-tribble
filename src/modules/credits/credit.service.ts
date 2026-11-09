import {
    and,
    desc,
    eq,
    sql,
} from "drizzle-orm";

import { db } from "../../database/index.ts";

import {
    listingCreditLedger,
} from "../../database/schema/index.ts";

import { AppError } from "../../errors/app-error.ts";

export const CREDIT_REASONS = {
    FREE_TRIAL: "FREE_TRIAL",
    SUBSCRIPTION_CREDIT: "SUBSCRIPTION_CREDIT",
    LISTING_CREATED: "LISTING_CREATED",
    ADMIN_ADJUSTMENT: "ADMIN_ADJUSTMENT",
} as const;

export type CreditReason =
    (typeof CREDIT_REASONS)[keyof typeof CREDIT_REASONS];

export const CREDIT_SOURCES = {
    FREE_TRIAL: "FREE_TRIAL",
    SUBSCRIPTION_CREDIT: "SUBSCRIPTION_CREDIT",
    ADMIN_ADJUSTMENT: "ADMIN_ADJUSTMENT",
} as const;

export type CreditSource =
    (typeof CREDIT_SOURCES)[keyof typeof CREDIT_SOURCES];

type DatabaseTransaction = Parameters<
    Parameters<typeof db.transaction>[0]
>[0];

export type CreditExecutor = typeof db | DatabaseTransaction;

export interface CreditBalance {
    userId: string;
    balance: number;
}

export interface CreditSourceBalance {
    total: number;
    used: number;
    remaining: number;
}

export interface CreditBreakdown {
    free: CreditSourceBalance;
    subscribed: CreditSourceBalance;
    adjustment: CreditSourceBalance;
    totalRemaining: number;
}

export interface CreditHistoryOptions {
    page?: number;
    limit?: number;
}

export interface CreditHistoryResult {
    items: Array<typeof listingCreditLedger.$inferSelect>;

    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export interface CreditConsumptionResult {
    consumed: number;
    remaining: number;
    inserted: boolean;

    consumedSource: CreditSource | null;

    subscriptionCreditsRemaining: number;
    freeCreditsRemaining: number;
    adjustmentCreditsRemaining: number;

    subscriptionCreditsExhausted: boolean;
}

function validateUserId(userId: string): void {
    if (
        typeof userId !== "string" ||
        userId.trim().length === 0
    ) {
        throw new AppError(
            "A valid user ID is required.",
            400,
            "INVALID_USER_ID",
        );
    }
}

function validateReason(
    reason: string,
): asserts reason is CreditReason {
    const allowedReasons = Object.values(CREDIT_REASONS);

    if (!allowedReasons.includes(reason as CreditReason)) {
        throw new AppError(
            `Invalid credit reason: ${reason}`,
            400,
            "INVALID_CREDIT_REASON",
        );
    }
}

function validateReferenceId(referenceId: string): void {
    const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(referenceId)) {
        throw new AppError(
            "A valid UUID reference ID is required.",
            400,
            "INVALID_CREDIT_REFERENCE",
        );
    }
}

function getCreditSourceForReason(
    reason: CreditReason,
): CreditSource {
    switch (reason) {
        case CREDIT_REASONS.FREE_TRIAL:
            return CREDIT_SOURCES.FREE_TRIAL;

        case CREDIT_REASONS.SUBSCRIPTION_CREDIT:
            return CREDIT_SOURCES.SUBSCRIPTION_CREDIT;

        case CREDIT_REASONS.ADMIN_ADJUSTMENT:
            return CREDIT_SOURCES.ADMIN_ADJUSTMENT;

        default:
            throw new AppError(
                "This credit reason cannot be used to grant credits.",
                400,
                "INVALID_CREDIT_GRANT_REASON",
            );
    }
}

/**
 * Acquire a transaction-scoped advisory lock for a user's credit ledger.
 *
 * Every grant and consumption operation must use this lock.
 */
export async function lockUserCredits(
    executor: DatabaseTransaction,
    userId: string,
): Promise<void> {
    await executor.execute(
        sql`SELECT pg_advisory_xact_lock(
            hashtextextended(
                ${`karmass:listing-credit:${userId}`},
                0
            )
        )`,
    );
}

/**
 * Calculate the combined credit balance.
 */
export async function getCreditBalanceUsingExecutor(
    executor: CreditExecutor,
    userId: string,
): Promise<number> {
    validateUserId(userId);

    const result = await executor
        .select({
            balance: sql<number>`
                COALESCE(SUM(${listingCreditLedger.amount}), 0)::int
            `,
        })
        .from(listingCreditLedger)
        .where(eq(listingCreditLedger.userId, userId));

    return Number(result[0]?.balance ?? 0);
}

/**
 * Get credits grouped by their original source.
 *
 * total = all positive credits granted from this source.
 * used = all credits consumed from this source.
 * remaining = current balance from this source.
 */
export async function getCreditBreakdownUsingExecutor(
    executor: CreditExecutor,
    userId: string,
): Promise<CreditBreakdown> {
    validateUserId(userId);

    const result = await executor
        .select({
            freeTotal: sql<number>`
                COALESCE(
                    SUM(
                        CASE
                            WHEN ${listingCreditLedger.creditSource} = ${CREDIT_SOURCES.FREE_TRIAL}
                            AND ${listingCreditLedger.amount} > 0
                            THEN ${listingCreditLedger.amount}
                            ELSE 0
                        END
                    ),
                    0
                )::int
            `,

            freeUsed: sql<number>`
                COALESCE(
                    SUM(
                        CASE
                            WHEN ${listingCreditLedger.creditSource} = ${CREDIT_SOURCES.FREE_TRIAL}
                            AND ${listingCreditLedger.amount} < 0
                            THEN ABS(${listingCreditLedger.amount})
                            ELSE 0
                        END
                    ),
                    0
                )::int
            `,

            freeRemaining: sql<number>`
                COALESCE(
                    SUM(
                        CASE
                            WHEN ${listingCreditLedger.creditSource} = ${CREDIT_SOURCES.FREE_TRIAL}
                            THEN ${listingCreditLedger.amount}
                            ELSE 0
                        END
                    ),
                    0
                )::int
            `,

            subscribedTotal: sql<number>`
                COALESCE(
                    SUM(
                        CASE
                            WHEN ${listingCreditLedger.creditSource} = ${CREDIT_SOURCES.SUBSCRIPTION_CREDIT}
                            AND ${listingCreditLedger.amount} > 0
                            THEN ${listingCreditLedger.amount}
                            ELSE 0
                        END
                    ),
                    0
                )::int
            `,

            subscribedUsed: sql<number>`
                COALESCE(
                    SUM(
                        CASE
                            WHEN ${listingCreditLedger.creditSource} = ${CREDIT_SOURCES.SUBSCRIPTION_CREDIT}
                            AND ${listingCreditLedger.amount} < 0
                            THEN ABS(${listingCreditLedger.amount})
                            ELSE 0
                        END
                    ),
                    0
                )::int
            `,

            subscribedRemaining: sql<number>`
                COALESCE(
                    SUM(
                        CASE
                            WHEN ${listingCreditLedger.creditSource} = ${CREDIT_SOURCES.SUBSCRIPTION_CREDIT}
                            THEN ${listingCreditLedger.amount}
                            ELSE 0
                        END
                    ),
                    0
                )::int
            `,

            adjustmentTotal: sql<number>`
                COALESCE(
                    SUM(
                        CASE
                            WHEN ${listingCreditLedger.creditSource} = ${CREDIT_SOURCES.ADMIN_ADJUSTMENT}
                            AND ${listingCreditLedger.amount} > 0
                            THEN ${listingCreditLedger.amount}
                            ELSE 0
                        END
                    ),
                    0
                )::int
            `,

            adjustmentUsed: sql<number>`
                COALESCE(
                    SUM(
                        CASE
                            WHEN ${listingCreditLedger.creditSource} = ${CREDIT_SOURCES.ADMIN_ADJUSTMENT}
                            AND ${listingCreditLedger.amount} < 0
                            THEN ABS(${listingCreditLedger.amount})
                            ELSE 0
                        END
                    ),
                    0
                )::int
            `,

            adjustmentRemaining: sql<number>`
                COALESCE(
                    SUM(
                        CASE
                            WHEN ${listingCreditLedger.creditSource} = ${CREDIT_SOURCES.ADMIN_ADJUSTMENT}
                            THEN ${listingCreditLedger.amount}
                            ELSE 0
                        END
                    ),
                    0
                )::int
            `,
        })
        .from(listingCreditLedger)
        .where(eq(listingCreditLedger.userId, userId));

    const row = result[0];

    const free: CreditSourceBalance = {
        total: Number(row?.freeTotal ?? 0),
        used: Number(row?.freeUsed ?? 0),
        remaining: Number(row?.freeRemaining ?? 0),
    };

    const subscribed: CreditSourceBalance = {
        total: Number(row?.subscribedTotal ?? 0),
        used: Number(row?.subscribedUsed ?? 0),
        remaining: Number(row?.subscribedRemaining ?? 0),
    };

    const adjustment: CreditSourceBalance = {
        total: Number(row?.adjustmentTotal ?? 0),
        used: Number(row?.adjustmentUsed ?? 0),
        remaining: Number(row?.adjustmentRemaining ?? 0),
    };

    return {
        free,
        subscribed,
        adjustment,
        totalRemaining:
            free.remaining +
            subscribed.remaining +
            adjustment.remaining,
    };
}

/**
 * Return a user's current listing-credit balance.
 */
export async function getCreditBalance(
    userId: string,
): Promise<CreditBalance> {
    validateUserId(userId);

    const balance = await getCreditBalanceUsingExecutor(
        db,
        userId,
    );

    return {
        userId,
        balance,
    };
}

/**
 * Return a user's complete credit breakdown.
 */
export async function getCreditBreakdown(
    userId: string,
): Promise<CreditBreakdown> {
    validateUserId(userId);

    return getCreditBreakdownUsingExecutor(db, userId);
}

/**
 * Grant credits exactly once for a user, reason and reference.
 *
 * FREE_TRIAL grants are assigned to the free pool.
 * SUBSCRIPTION_CREDIT grants are assigned to the subscription pool.
 * ADMIN_ADJUSTMENT grants are assigned to the adjustment pool.
 */
export async function grantCredits(
    input: {
        userId: string;
        amount: number;
        reason: CreditReason;
        referenceId: string;
    },
    executor?: DatabaseTransaction,
): Promise<{
    balance: number;
    inserted: boolean;
}> {
    validateUserId(input.userId);
    validateReason(input.reason);
    validateReferenceId(input.referenceId);

    if (
        !Number.isSafeInteger(input.amount) ||
        input.amount <= 0
    ) {
        throw new AppError(
            "Credit grant amount must be a positive integer.",
            400,
            "INVALID_CREDIT_AMOUNT",
        );
    }

    const creditSource = getCreditSourceForReason(input.reason);

    if (executor) {
        return grantCreditsUsingExecutor(
            executor,
            {
                ...input,
                creditSource,
            },
        );
    }

    return db.transaction(async (tx) => {
        return grantCreditsUsingExecutor(
            tx,
            {
                ...input,
                creditSource,
            },
        );
    });
}

async function grantCreditsUsingExecutor(
    executor: DatabaseTransaction,
    input: {
        userId: string;
        amount: number;
        reason: CreditReason;
        referenceId: string;
        creditSource: CreditSource;
    },
): Promise<{
    balance: number;
    inserted: boolean;
}> {
    await lockUserCredits(executor, input.userId);

    const insertedRows = await executor
        .insert(listingCreditLedger)
        .values({
            userId: input.userId,
            amount: input.amount,
            reason: input.reason,
            referenceId: input.referenceId,
            creditSource: input.creditSource,
        })
        .onConflictDoNothing({
            target: [
                listingCreditLedger.userId,
                listingCreditLedger.reason,
                listingCreditLedger.referenceId,
            ],
        })
        .returning({
            id: listingCreditLedger.id,
        });

    const inserted = insertedRows.length > 0;

    if (!inserted) {
        const existingRows = await executor
            .select({
                amount: listingCreditLedger.amount,
                reason: listingCreditLedger.reason,
                referenceId: listingCreditLedger.referenceId,
                creditSource: listingCreditLedger.creditSource,
            })
            .from(listingCreditLedger)
            .where(
                and(
                    eq(
                        listingCreditLedger.userId,
                        input.userId,
                    ),
                    eq(
                        listingCreditLedger.reason,
                        input.reason,
                    ),
                    eq(
                        listingCreditLedger.referenceId,
                        input.referenceId,
                    ),
                ),
            )
            .limit(1);

        const existing = existingRows[0];

        if (
            !existing ||
            existing.amount !== input.amount ||
            existing.reason !== input.reason ||
            existing.referenceId !== input.referenceId ||
            existing.creditSource !== input.creditSource
        ) {
            throw new AppError(
                "The credit reference conflicts with an existing ledger entry.",
                409,
                "CREDIT_REFERENCE_CONFLICT",
            );
        }
    }

    const balance = await getCreditBalanceUsingExecutor(
        executor,
        input.userId,
    );

    return {
        balance,
        inserted,
    };
}

/**
 * Consume exactly one listing credit.
 *
 * Spending order:
 * 1. Subscription credits.
 * 2. Free trial credits.
 * 3. Admin adjustment credits.
 *
 * Subscription credits are not tied to subscription expiry. Their remaining
 * balance stays available until consumed.
 *
 * Call this inside the same transaction that creates the listing.
 */
export async function consumeCreditUsingExecutor(
    executor: DatabaseTransaction,
    input: {
        userId: string;
        reason: CreditReason;
        referenceId: string;
    },
): Promise<CreditConsumptionResult> {
    validateUserId(input.userId);
    validateReason(input.reason);
    validateReferenceId(input.referenceId);

    if (input.reason !== CREDIT_REASONS.LISTING_CREATED) {
        throw new AppError(
            "Invalid reason for listing-credit consumption.",
            400,
            "INVALID_CREDIT_CONSUMPTION_REASON",
        );
    }

    await lockUserCredits(executor, input.userId);

    const existingRows = await executor
        .select({
            amount: listingCreditLedger.amount,
            creditSource: listingCreditLedger.creditSource,
        })
        .from(listingCreditLedger)
        .where(
            and(
                eq(
                    listingCreditLedger.userId,
                    input.userId,
                ),
                eq(
                    listingCreditLedger.reason,
                    input.reason,
                ),
                eq(
                    listingCreditLedger.referenceId,
                    input.referenceId,
                ),
            ),
        )
        .limit(1);

    const existing = existingRows[0];

    if (existing) {
        if (
            existing.amount !== -1 ||
            !Object.values(CREDIT_SOURCES).includes(
                existing.creditSource as CreditSource,
            )
        ) {
            throw new AppError(
                "The credit reference conflicts with an existing ledger entry.",
                409,
                "CREDIT_REFERENCE_CONFLICT",
            );
        }

        const breakdown = await getCreditBreakdownUsingExecutor(
            executor,
            input.userId,
        );

        return {
            consumed: 1,
            remaining: breakdown.totalRemaining,
            inserted: false,
            consumedSource: existing.creditSource as CreditSource,
            subscriptionCreditsRemaining: breakdown.subscribed.remaining,
            freeCreditsRemaining: breakdown.free.remaining,
            adjustmentCreditsRemaining: breakdown.adjustment.remaining,
            subscriptionCreditsExhausted: false,
        };
    }

    const breakdownBefore = await getCreditBreakdownUsingExecutor(
        executor,
        input.userId,
    );

    if (breakdownBefore.totalRemaining < 1) {
        throw new AppError(
            "You do not have enough listing credits. Please purchase a subscription plan to continue.",
            402,
            "INSUFFICIENT_LISTING_CREDITS",
        );
    }

    let consumedSource: CreditSource;

    if (breakdownBefore.subscribed.remaining > 0) {
        consumedSource = CREDIT_SOURCES.SUBSCRIPTION_CREDIT;
    } else if (breakdownBefore.free.remaining > 0) {
        consumedSource = CREDIT_SOURCES.FREE_TRIAL;
    } else if (breakdownBefore.adjustment.remaining > 0) {
        consumedSource = CREDIT_SOURCES.ADMIN_ADJUSTMENT;
    } else {
        throw new AppError(
            "You do not have enough listing credits. Please purchase a subscription plan to continue.",
            402,
            "INSUFFICIENT_LISTING_CREDITS",
        );
    }

    await executor
        .insert(listingCreditLedger)
        .values({
            userId: input.userId,
            amount: -1,
            reason: input.reason,
            referenceId: input.referenceId,
            creditSource: consumedSource,
        });

    const breakdownAfter = await getCreditBreakdownUsingExecutor(
        executor,
        input.userId,
    );

    const subscriptionCreditsExhausted =
        consumedSource === CREDIT_SOURCES.SUBSCRIPTION_CREDIT &&
        breakdownBefore.subscribed.remaining > 0 &&
        breakdownAfter.subscribed.remaining === 0;

    return {
        consumed: 1,
        remaining: breakdownAfter.totalRemaining,
        inserted: true,
        consumedSource,
        subscriptionCreditsRemaining: breakdownAfter.subscribed.remaining,
        freeCreditsRemaining: breakdownAfter.free.remaining,
        adjustmentCreditsRemaining: breakdownAfter.adjustment.remaining,
        subscriptionCreditsExhausted,
    };
}

/**
 * Return paginated credit history for a user.
 */
export async function getCreditHistory(
    userId: string,
    options: CreditHistoryOptions = {},
): Promise<CreditHistoryResult> {
    validateUserId(userId);

    const page = options.page ?? 1;
    const limit = options.limit ?? 20;

    if (
        !Number.isInteger(page) ||
        page < 1 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100
    ) {
        throw new AppError(
            "Invalid credit history pagination.",
            400,
            "INVALID_PAGINATION",
        );
    }

    const offset = (page - 1) * limit;

    const [items, countRows] = await Promise.all([
        db
            .select()
            .from(listingCreditLedger)
            .where(eq(listingCreditLedger.userId, userId))
            .orderBy(
                desc(listingCreditLedger.createdAt),
                desc(listingCreditLedger.id),
            )
            .limit(limit)
            .offset(offset),

        db
            .select({
                total: sql<number>`COUNT(*)::int`,
            })
            .from(listingCreditLedger)
            .where(eq(listingCreditLedger.userId, userId)),
    ]);

    const total = Number(countRows[0]?.total ?? 0);

    return {
        items,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}