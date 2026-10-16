import {
    and,
    eq,
    sql,
} from "drizzle-orm";

import { db } from "../../../../database/index.ts";

import {
    listingCreditLedger,
    users,
} from "../../../../database/schema/index.ts";

import { AppError } from "../../../../errors/app-error.ts";
import { writeAuditRecord } from "../../../../helpers/audit/audit.service.ts";

import {
    CREDIT_REASONS,
    getCreditBalanceUsingExecutor,
    lockUserCredits,
} from "../../../credits/credit.service.ts";

interface AdminCreditAdjustmentInput {
    actorUserId: string;
    targetUserId: string;
    amount: number;
    reason: string;

    /**
     * A client-generated UUID that identifies this adjustment.
     *
     * Reuse the same UUID when retrying the same request.
     * Generate a new UUID for a genuinely new adjustment.
     */
    referenceId: string;

    ipAddress?: string;
    userAgent?: string;
}

interface AdminCreditAdjustmentResult {
    userId: string;
    adjustment: number;
    balance: number;
    referenceId: string;
    inserted: boolean;
}

function validateUuid(
    value: string,
    fieldName: string,
): void {
    const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (
        typeof value !== "string" ||
        !uuidRegex.test(value)
    ) {
        throw new AppError(
            `${fieldName} must be a valid UUID.`,
            400,
            "INVALID_UUID",
        );
    }
}

function validateAdjustmentAmount(
    amount: number,
): void {
    if (
        !Number.isSafeInteger(amount) ||
        amount === 0
    ) {
        throw new AppError(
            "Adjustment amount must be a non-zero integer.",
            400,
            "INVALID_CREDIT_ADJUSTMENT",
        );
    }
}

function validateAdjustmentReason(
    reason: string,
): string {
    if (typeof reason !== "string") {
        throw new AppError(
            "An adjustment reason is required.",
            400,
            "CREDIT_ADJUSTMENT_REASON_REQUIRED",
        );
    }

    const normalizedReason = reason.trim();

    if (
        normalizedReason.length < 10 ||
        normalizedReason.length > 500
    ) {
        throw new AppError(
            "The adjustment reason must contain between 10 and 500 characters.",
            400,
            "INVALID_CREDIT_ADJUSTMENT_REASON",
        );
    }

    return normalizedReason;
}

/**
 * Adjust a user's listing-credit balance.
 *
 * Positive amount:
 *   Grants credits.
 *
 * Negative amount:
 *   Removes credits, provided the resulting balance
 *   does not become negative.
 *
 * The ledger entry and audit record are committed
 * together in one database transaction.
 *
 * Existing ledger records are never updated or deleted.
 */
export async function adjustUserListingCredits(
    input: AdminCreditAdjustmentInput,
): Promise<AdminCreditAdjustmentResult> {
    validateUuid(
        input.actorUserId,
        "Administrator ID",
    );

    validateUuid(
        input.targetUserId,
        "Target user ID",
    );

    validateUuid(
        input.referenceId,
        "Adjustment reference ID",
    );

    validateAdjustmentAmount(
        input.amount,
    );

    const reason =
        validateAdjustmentReason(
            input.reason,
        );

    return db.transaction(
        async (tx) => {
            /*
             * Serialize credit operations for this user.
             *
             * This must happen before checking the current
             * balance so concurrent adjustments or listing
             * creations cannot spend the same credits.
             */
            await lockUserCredits(
                tx,
                input.targetUserId,
            );

            /*
             * Confirm the target account exists.
             */
            const targetUserRows =
                await tx
                    .select({
                        id: users.id,
                    })
                    .from(users)
                    .where(
                        eq(
                            users.id,
                            input.targetUserId,
                        ),
                    )
                    .limit(1);

            if (!targetUserRows[0]) {
                throw new AppError(
                    "The target user does not exist.",
                    404,
                    "CREDIT_TARGET_USER_NOT_FOUND",
                );
            }

            /*
             * Check whether this adjustment has already
             * been applied.
             *
             * ADMIN_ADJUSTMENT + referenceId identifies
             * this adjustment for this particular user.
             */
            const existingRows =
                await tx
                    .select({
                        id: listingCreditLedger.id,
                        amount: listingCreditLedger.amount,
                        referenceId:
                            listingCreditLedger.referenceId,
                    })
                    .from(listingCreditLedger)
                    .where(
                        and(
                            eq(
                                listingCreditLedger.userId,
                                input.targetUserId,
                            ),
                            eq(
                                listingCreditLedger.reason,
                                CREDIT_REASONS.ADMIN_ADJUSTMENT,
                            ),
                            eq(
                                listingCreditLedger.referenceId,
                                input.referenceId,
                            ),
                        ),
                    )
                    .limit(1);

            const existing =
                existingRows[0];

            if (existing) {
                /*
                 * A retry is allowed only when the original
                 * amount matches the requested amount.
                 */
                if (
                    existing.amount !==
                    input.amount
                ) {
                    throw new AppError(
                        "This adjustment reference has already been used with a different amount.",
                        409,
                        "CREDIT_ADJUSTMENT_REFERENCE_CONFLICT",
                    );
                }

                /*
                 * The original request already succeeded.
                 * Do not insert another ledger entry or audit
                 * record.
                 */
                const balance =
                    await getCreditBalanceUsingExecutor(
                        tx,
                        input.targetUserId,
                    );

                return {
                    userId:
                        input.targetUserId,
                    adjustment:
                        existing.amount,
                    balance,
                    referenceId:
                        input.referenceId,
                    inserted: false,
                };
            }

            /*
             * Read the balance after acquiring the lock.
             */
            const currentBalance =
                await getCreditBalanceUsingExecutor(
                    tx,
                    input.targetUserId,
                );

            const resultingBalance =
                currentBalance +
                input.amount;

            /*
             * Prevent invalid or negative balances.
             */
            if (
                !Number.isSafeInteger(
                    resultingBalance,
                ) ||
                resultingBalance < 0
            ) {
                throw new AppError(
                    "This adjustment would make the user's listing-credit balance negative.",
                    409,
                    "INSUFFICIENT_LISTING_CREDITS",
                );
            }

            /*
             * Insert a new immutable ledger entry.
             *
             * Never update or delete existing ledger rows.
             */
            const insertedRows =
                await tx
                    .insert(
                        listingCreditLedger,
                    )
                    .values({
                        userId:
                            input.targetUserId,
                        amount:
                            input.amount,
                        reason:
                            CREDIT_REASONS.ADMIN_ADJUSTMENT,
                        referenceId:
                            input.referenceId,
                    })
                    .onConflictDoNothing({
                        target: [
                            listingCreditLedger.userId,
                            listingCreditLedger.reason,
                            listingCreditLedger.referenceId,
                        ],
                    })
                    .returning({
                        id:
                            listingCreditLedger.id,
                    });

            /*
             * The advisory lock serializes adjustments made
             * through the credit service. This extra check
             * also handles an unexpected uniqueness conflict.
             */
            if (!insertedRows[0]) {
                throw new AppError(
                    "The adjustment reference has already been used. Retry using the original request reference.",
                    409,
                    "CREDIT_ADJUSTMENT_REFERENCE_CONFLICT",
                );
            }

            /*
             * Write the audit record through the same
             * transaction executor.
             *
             * If this insert fails, the ledger insertion
             * is rolled back as well.
             */
            await writeAuditRecord(tx, {
                actorUserId: input.actorUserId,
                action: "LISTING_CREDITS_ADJUSTED",
                entityType: "listing_credit",
                entityId: input.targetUserId,
                ...(input.ipAddress !== undefined ? { ipAddress: input.ipAddress } : {}),
                ...(input.userAgent !== undefined ? { userAgent: input.userAgent } : {}),
                metadata: {
                    targetUserId: input.targetUserId,
                    adjustment: input.amount,
                    previousBalance: currentBalance,
                    resultingBalance,
                    reason,
                    referenceId: input.referenceId,
                    ledgerEntryId: insertedRows[0].id,
                },
            });

            /*
             * Calculate the authoritative balance from
             * the ledger instead of trusting arithmetic
             * performed by the caller.
             */
            const balance =
                await getCreditBalanceUsingExecutor(
                    tx,
                    input.targetUserId,
                );

            return {
                userId:
                    input.targetUserId,
                adjustment:
                    input.amount,
                balance,
                referenceId:
                    input.referenceId,
                inserted: true,
            };
        },
    );
}