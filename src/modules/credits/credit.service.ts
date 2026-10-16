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

type DatabaseTransaction = Parameters<
    Parameters<typeof db.transaction>[0]
>[0];

export type CreditExecutor = typeof db | DatabaseTransaction;

export interface CreditBalance {
    userId: string;
    balance: number;
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

    if (
        !allowedReasons.includes(
            reason as CreditReason,
        )
    ) {
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

/**
 * Acquire a transaction-scoped advisory lock for a user's credit ledger.
 *
 * All operations that grant or consume credits must use this lock so
 * concurrent requests cannot spend the same credit simultaneously.
 */
export async function lockUserCredits(
    executor: DatabaseTransaction,
    userId: string,
): Promise<void> {
    await executor.execute(
        sql`SELECT pg_advisory_xact_lock(
            hashtext(${`karmass:listing-credit:${userId}`})
        )`,
    );
}

/**
 * Calculate the user's current balance from immutable ledger movements.
 */
export async function getCreditBalanceUsingExecutor(
    executor: CreditExecutor,
    userId: string,
): Promise<number> {
    validateUserId(userId);

    const result = await executor
        .select({
            balance: sql<number>`COALESCE(SUM(${listingCreditLedger.amount}), 0)::int`,
        })
        .from(listingCreditLedger)
        .where(eq(listingCreditLedger.userId, userId));

    return Number(result[0]?.balance ?? 0);
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
 * Grant credits exactly once for a particular user, reason and reference.
 *
 * Always provide a stable reference ID, such as a user ID for a free-trial
 * grant or a subscription ID for a subscription grant.
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

    if (executor) {
        return grantCreditsUsingExecutor(executor, input);
    }

    return db.transaction(async (tx) => {
        return grantCreditsUsingExecutor(tx, input);
    });
}

async function grantCreditsUsingExecutor(
    executor: DatabaseTransaction,
    input: {
        userId: string;
        amount: number;
        reason: string;
        referenceId: string;
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
                referenceId: listingCreditLedger.referenceId,
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
            existing.referenceId !== input.referenceId
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
 * Call this inside the same transaction that creates the listing.
 * The listing ID is the reference ID, preventing duplicate consumption
 * for the same listing.
 */
export async function consumeCreditUsingExecutor(
    executor: DatabaseTransaction,
    input: {
        userId: string;
        reason: CreditReason;
        referenceId: string;
    },
): Promise<{
    consumed: number;
    remaining: number;
    inserted: boolean;
}> {
    validateUserId(input.userId);
    validateReason(input.reason);
    validateReferenceId(input.referenceId);

    await lockUserCredits(executor, input.userId);

    const existingRows = await executor
        .select({
            amount: listingCreditLedger.amount,
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
        if (existing.amount !== -1) {
            throw new AppError(
                "The credit reference conflicts with an existing ledger entry.",
                409,
                "CREDIT_REFERENCE_CONFLICT",
            );
        }

        const balance = await getCreditBalanceUsingExecutor(
            executor,
            input.userId,
        );

        return {
            consumed: 1,
            remaining: balance,
            inserted: false,
        };
    }

    const balance = await getCreditBalanceUsingExecutor(
        executor,
        input.userId,
    );

    if (balance < 1) {
        throw new AppError(
            "You do not have enough listing credits. Please subscribe to continue.",
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
        });

    return {
        consumed: 1,
        remaining: balance - 1,
        inserted: true,
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