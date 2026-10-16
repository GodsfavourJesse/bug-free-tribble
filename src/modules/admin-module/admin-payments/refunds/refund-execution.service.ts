import { and, eq, sql } from "drizzle-orm";

import { db } from "../../../../database/index.ts";

import {
    payments,
    refundRequests,
} from "../../../../database/schema/index.ts";

import { writeAuditRecord } from "../../../../helpers/audit/audit.service.ts";

import {
    createPaystackRefund,
    fetchPaystackRefund,
    listPaystackRefunds,
} from "../../../payment-module/paystack/paystack.service.ts";

/*
 * ============================================================
 * TYPES
 * ============================================================
 */

export interface ExecuteRefundInput {
    refundId: string;
    adminUserId: string;
    ipAddress?: string;
    userAgent?: string;
}

type ProviderRefundStatus =
    | "SUCCESS"
    | "PROCESSING"
    | "FAILED";

interface AuditContext {
    adminUserId: string;
    ipAddress?: string;
    userAgent?: string;
}

interface RefundExecutionContext {
    refundId: string;
    paymentId: string;
}

interface RefundProviderData {
    id: number;
    amount: number;
    currency: string;
    status: string;
}

interface PreparedRefund {
    paymentId: string;
    paymentReference: string;
    refundId: string;
    amountSubunit: number;
    currency: string;
    amount: string;
}

/*
 * ============================================================
 * CONSTANTS
 * ============================================================
 */

const SUPPORTED_PROVIDER = "PAYSTACK";

const SUPPORTED_CURRENCY = "NGN";

const KOBO_PER_NAIRA = 100;

const REFUND_LOCK_PREFIX = "karmass:refund:";

const REFUND_REQUEST_LOCK_PREFIX =
    "karmass:refund-request:";

const MAX_REFUND_LIST_PAGES = 10;

const REFUND_LIST_PAGE_SIZE = 100;

const RESERVED_REFUND_STATUSES = [
    "PENDING",
    "APPROVED",
    "PROCESSING",
    "SUCCESS",
] as const;

/*
 * ============================================================
 * ERROR HELPER
 * ============================================================
 */

function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return "An unknown error occurred.";
}

function createOperationalError(message: string): Error {
    return new Error(message);
}

/*
 * ============================================================
 * PROVIDER STATUS MAPPING
 * ============================================================
 */

function normalizeProviderStatus(
    status: string,
): ProviderRefundStatus {
    const normalized = status.trim().toLowerCase();

    if (normalized === "processed") {
        return "SUCCESS";
    }

    if (
        normalized === "pending" ||
        normalized === "processing"
    ) {
        return "PROCESSING";
    }

    if (normalized === "failed") {
        return "FAILED";
    }

    /*
     * Unknown statuses must never be considered successful.
     *
     * Keep the refund unresolved so that a subsequent
     * reconciliation can retrieve the latest provider status.
     */
    return "PROCESSING";
}

/*
 * ============================================================
 * MONEY HELPERS
 * ============================================================
 *
 * PostgreSQL numeric values are commonly returned as strings.
 *
 * For NGN, monetary comparisons are performed using integer
 * kobo to avoid JavaScript floating-point addition.
 */

/**
 * Convert a PostgreSQL monetary value in naira to integer kobo.
 *
 * Accepted examples:
 * "5000"
 * "5000.00"
 * "0.50"
 *
 * Rejected examples:
 * "-100"
 * "1.001"
 * "NaN"
 */
function toKobo(amount: string | number): number {
    const normalized = String(amount).trim();

    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
        throw createOperationalError(
            "The monetary amount is invalid.",
        );
    }

    const [wholePart, fractionalPart = ""] =
        normalized.split(".");

    const whole = Number(wholePart);

    const fractional = Number(
        fractionalPart.padEnd(2, "0"),
    );

    if (
        !Number.isSafeInteger(whole) ||
        !Number.isSafeInteger(fractional)
    ) {
        throw createOperationalError(
            "The monetary amount cannot be represented safely.",
        );
    }

    const result =
        whole * KOBO_PER_NAIRA + fractional;

    if (!Number.isSafeInteger(result)) {
        throw createOperationalError(
            "The monetary amount exceeds the supported safe range.",
        );
    }

    return result;
}

/**
 * Convert a positive NGN amount to Paystack's subunit.
 */
function toPaystackSubunit(
    amount: string,
    currency: string,
): number {
    if (currency.trim().toUpperCase() !== SUPPORTED_CURRENCY) {
        throw createOperationalError(
            `Automated refunds are not enabled for ${currency}.`,
        );
    }

    const subunit = toKobo(amount);

    if (subunit <= 0) {
        throw createOperationalError(
            "The refund amount must be greater than zero.",
        );
    }

    return subunit;
}

/**
 * Validate an amount returned by Paystack.
 *
 * Paystack expresses NGN amounts in kobo.
 */
function validateProviderAmount(
    amount: number,
): number {
    if (
        !Number.isSafeInteger(amount) ||
        amount <= 0
    ) {
        throw createOperationalError(
            "Paystack returned an invalid refund amount.",
        );
    }

    return amount;
}

/**
 * Normalize currency strings for comparison.
 */
function normalizeCurrency(currency: string): string {
    return currency.trim().toUpperCase();
}

/*
 * ============================================================
 * AUDIT HELPERS
 * ============================================================
 */

function auditMetadata(context: AuditContext) {
    return {
        actorUserId: context.adminUserId,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
    };
}

function buildAuditContext(
    input: {
        adminUserId: string;
        ipAddress?: string;
        userAgent?: string;
    },
): AuditContext {
    return {
        adminUserId: input.adminUserId,
        ...(input.ipAddress !== undefined
            ? { ipAddress: input.ipAddress }
            : {}),
        ...(input.userAgent !== undefined
            ? { userAgent: input.userAgent }
            : {}),
    };
}

/*
 * ============================================================
 * ADVISORY LOCK HELPERS
 * ============================================================
 *
 * Always acquire the payment-level lock before the
 * refund-request-level lock.
 *
 * Every refund operation that reserves refundable balance
 * should follow the same locking convention.
 */

async function lockPaymentRefunds(
    executor: {
        execute: typeof db.execute;
    },
    paymentId: string,
): Promise<void> {
    await executor.execute(sql`
        SELECT pg_advisory_xact_lock(
            hashtext(
                ${`${REFUND_LOCK_PREFIX}${paymentId}`}
            )
        )
    `);
}

async function lockRefundRequest(
    executor: {
        execute: typeof db.execute;
    },
    refundId: string,
): Promise<void> {
    await executor.execute(sql`
        SELECT pg_advisory_xact_lock(
            hashtext(
                ${`${REFUND_REQUEST_LOCK_PREFIX}${refundId}`}
            )
        )
    `);
}

/*
 * ============================================================
 * SAVE PROVIDER REFUND STATUS
 * ============================================================
 *
 * Provider status updates are serialized by the payment and
 * refund locks.
 *
 * This function never creates a new provider refund.
 */

async function updateRefundFromProvider(input: {
    refundId: string;
    adminUserId: string;
    providerRefundId: string;
    providerData: unknown;
    providerStatus: string;
    ipAddress?: string;
    userAgent?: string;
}) {
    const providerRefundId =
        input.providerRefundId.trim();

    if (
        !providerRefundId ||
        !/^\d+$/.test(providerRefundId)
    ) {
        throw createOperationalError(
            "A valid Paystack refund ID is required.",
        );
    }

    const mappedStatus = normalizeProviderStatus(
        input.providerStatus,
    );

    return db.transaction(async (tx) => {
        const initialRows = await tx
            .select({
                id: refundRequests.id,
                paymentId: refundRequests.paymentId,
            })
            .from(refundRequests)
            .where(
                eq(
                    refundRequests.id,
                    input.refundId,
                ),
            )
            .limit(1);

        const initialRefund = initialRows[0];

        if (!initialRefund) {
            throw createOperationalError(
                "Refund request not found.",
            );
        }

        await lockPaymentRefunds(
            tx,
            initialRefund.paymentId,
        );

        await lockRefundRequest(
            tx,
            input.refundId,
        );

        const refundRows = await tx
            .select()
            .from(refundRequests)
            .where(
                eq(
                    refundRequests.id,
                    input.refundId,
                ),
            )
            .limit(1);

        const refund = refundRows[0];

        if (!refund) {
            throw createOperationalError(
                "Refund request not found.",
            );
        }

        /*
         * Do not silently replace an existing provider ID.
         */
        if (
            refund.providerRefundId &&
            refund.providerRefundId !== providerRefundId
        ) {
            throw createOperationalError(
                "The saved provider refund ID does not match the refund being reconciled. Manual investigation is required.",
            );
        }

        /*
         * A successful refund must never be downgraded.
         */
        if (refund.status === "SUCCESS") {
            return refund;
        }

        /*
         * Do not let an old provider response overwrite a
         * rejected refund or another terminal state.
         */
        if (
            refund.status !== "PROCESSING" &&
            refund.status !== "APPROVED"
        ) {
            throw createOperationalError(
                `Cannot reconcile a refund in status ${refund.status}.`,
            );
        }

        const updatedRows = await tx
            .update(refundRequests)
            .set({
                status: mappedStatus,
                provider: SUPPORTED_PROVIDER,
                providerRefundId,
                providerData: input.providerData,
                lastError:
                    mappedStatus === "PROCESSING"
                        ? "Paystack has not confirmed final completion."
                        : mappedStatus === "FAILED"
                          ? "Paystack reported that the refund failed."
                          : null,
                processedAt:
                    mappedStatus === "SUCCESS"
                        ? new Date()
                        : null,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(
                        refundRequests.id,
                        input.refundId,
                    ),
                    eq(
                        refundRequests.status,
                        refund.status,
                    ),
                ),
            )
            .returning();

        const updatedRefund = updatedRows[0];

        if (!updatedRefund) {
            throw createOperationalError(
                "Refund status changed during reconciliation. Check its current status before proceeding.",
            );
        }

        const context = auditMetadata(
            buildAuditContext(input),
        );

        await writeAuditRecord(tx, {
            ...context,
            action:
                mappedStatus === "SUCCESS"
                    ? "REFUND_SUCCEEDED"
                    : mappedStatus === "FAILED"
                      ? "REFUND_FAILED"
                      : "REFUND_RECONCILIATION_UPDATED",
            entityType: "REFUND",
            entityId: input.refundId,
            metadata: {
                provider: SUPPORTED_PROVIDER,
                providerRefundId,
                providerStatus: input.providerStatus,
                resultingStatus: mappedStatus,
            },
        });

        return updatedRefund;
    });
}

/*
 * ============================================================
 * RECORD RECONCILIATION ERROR
 * ============================================================
 *
 * This does not change the refund's status.
 */

async function recordReconciliationError(input: {
    refundId: string;
    message: string;
}): Promise<void> {
    await db
        .update(refundRequests)
        .set({
            lastError: input.message.slice(0, 2000),
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(
                    refundRequests.id,
                    input.refundId,
                ),
                eq(
                    refundRequests.status,
                    "PROCESSING",
                ),
                sql`${refundRequests.providerRefundId} IS NULL`,
            ),
        );
}

/*
 * ============================================================
 * RECOVER A MISSING PROVIDER REFUND ID
 * ============================================================
 *
 * The original provider request may have succeeded even though
 * KARMASS did not save the provider refund ID.
 *
 * This function searches Paystack records and NEVER submits
 * another refund.
 */

async function reconcileMissingProviderRefundId(input: {
    refundId: string;
    adminUserId: string;
    ipAddress?: string;
    userAgent?: string;
}) {
    const refundRows = await db
        .select()
        .from(refundRequests)
        .where(
            eq(
                refundRequests.id,
                input.refundId,
            ),
        )
        .limit(1);

    const refund = refundRows[0];

    if (!refund) {
        throw createOperationalError(
            "Refund request not found.",
        );
    }

    if (refund.status !== "PROCESSING") {
        throw createOperationalError(
            `Missing-ID reconciliation is only available for PROCESSING refunds. Current status: ${refund.status}.`,
        );
    }

    if (refund.providerRefundId) {
        throw createOperationalError(
            "This refund now has a provider refund ID. Reconcile that refund directly.",
        );
    }

    const paymentRows = await db
        .select()
        .from(payments)
        .where(
            eq(
                payments.id,
                refund.paymentId,
            ),
        )
        .limit(1);

    const payment = paymentRows[0];

    if (!payment) {
        throw createOperationalError(
            "The original payment associated with this refund could not be found.",
        );
    }

    if (payment.status !== "SUCCESS") {
        throw createOperationalError(
            "The original payment is not successful. Refund recovery has been stopped.",
        );
    }

    if (payment.provider !== SUPPORTED_PROVIDER) {
        throw createOperationalError(
            "This refund is not associated with a Paystack payment.",
        );
    }

    if (!payment.gatewayTransactionId) {
        throw createOperationalError(
            "The original Paystack transaction ID is missing. Do not resubmit this refund; manual reconciliation is required.",
        );
    }

    if (
        normalizeCurrency(payment.currency) !==
        normalizeCurrency(refund.currency)
    ) {
        throw createOperationalError(
            "The refund currency does not match the original payment currency.",
        );
    }

    const expectedMerchantNote =
        `KARMASS refund request ${refund.id}`;

    const expectedAmountSubunit = toPaystackSubunit(
        refund.amount,
        refund.currency,
    );

    const matches: Array<{
        id: number;
        amount: number;
        currency: string;
        status: string;
        merchantNote: string;
    }> = [];

    /*
     * Search a bounded number of pages. The merchant note is
     * our correlation key; matching amount alone is insufficient.
     */
    for (
        let page = 1;
        page <= MAX_REFUND_LIST_PAGES;
        page += 1
    ) {
        const response = await listPaystackRefunds({
            transactionId: payment.gatewayTransactionId,
            page,
            perPage: REFUND_LIST_PAGE_SIZE,
        });

        if (
            !response.status ||
            !Array.isArray(response.data)
        ) {
            throw createOperationalError(
                "Paystack did not return a valid refund list. The refund remains unresolved and has not been resubmitted.",
            );
        }

        for (const item of response.data) {
            if (
                item.merchant_note?.trim() !==
                expectedMerchantNote
            ) {
                continue;
            }

            matches.push({
                id: item.id,
                amount: item.amount,
                currency: item.currency,
                status: item.status,
                merchantNote:
                    item.merchant_note.trim(),
            });
        }

        const pageCount = response.meta?.pageCount;

        if (typeof pageCount === "number") {
            if (page >= pageCount) {
                break;
            }

            continue;
        }

        if (
            response.data.length <
            REFUND_LIST_PAGE_SIZE
        ) {
            break;
        }
    }

    if (matches.length === 0) {
        const message =
            "Paystack has not returned a refund matching this KARMASS request's merchant note. The refund remains PROCESSING. Do not submit it again automatically.";

        await recordReconciliationError({
            refundId: input.refundId,
            message,
        });

        throw createOperationalError(message);
    }

    if (matches.length > 1) {
        const message =
            "Multiple Paystack refunds match this KARMASS refund request. No refund was selected automatically; manual financial reconciliation is required.";

        await recordReconciliationError({
            refundId: input.refundId,
            message,
        });

        throw createOperationalError(message);
    }

    const match = matches[0];

    if (
        !match ||
        !Number.isSafeInteger(match.id) ||
        match.id <= 0
    ) {
        throw createOperationalError(
            "Paystack returned an invalid refund ID. Manual reconciliation is required.",
        );
    }

    if (
        validateProviderAmount(match.amount) !==
            expectedAmountSubunit ||
        normalizeCurrency(match.currency) !==
            normalizeCurrency(refund.currency)
    ) {
        const message =
            "The matching Paystack refund has a different amount or currency from the KARMASS refund request. No automatic reconciliation was performed.";

        await recordReconciliationError({
            refundId: input.refundId,
            message,
        });

        throw createOperationalError(message);
    }

    /*
     * Fetch the individual refund to confirm its current status.
     */
    const providerResponse = await fetchPaystackRefund(
        match.id,
    );

    if (
        !providerResponse.status ||
        !providerResponse.data
    ) {
        throw createOperationalError(
            "The matching refund was found in Paystack's list, but its individual status could not be verified. The refund has not been resubmitted.",
        );
    }

    const providerRefund = providerResponse.data;

    if (
        String(providerRefund.id) !==
        String(match.id)
    ) {
        throw createOperationalError(
            "The fetched Paystack refund ID did not match the refund found in the list.",
        );
    }

    if (
        validateProviderAmount(providerRefund.amount) !==
            expectedAmountSubunit ||
        normalizeCurrency(providerRefund.currency) !==
            normalizeCurrency(refund.currency)
    ) {
        const message =
            "The individual Paystack refund's amount or currency does not match the KARMASS request. Manual reconciliation is required.";

        await recordReconciliationError({
            refundId: input.refundId,
            message,
        });

        throw createOperationalError(message);
    }

    return updateRefundFromProvider({
        refundId: input.refundId,
        adminUserId: input.adminUserId,
        providerRefundId: String(providerRefund.id),
        providerData: providerRefund,
        providerStatus: providerRefund.status,
        ...(input.ipAddress !== undefined
            ? { ipAddress: input.ipAddress }
            : {}),
        ...(input.userAgent !== undefined
            ? { userAgent: input.userAgent }
            : {}),
    });
}

/*
 * ============================================================
 * PREPARE REFUND SUBMISSION
 * ============================================================
 *
 * This transaction reserves the refund before contacting
 * Paystack.
 *
 * No network requests are made while holding the transaction.
 */

async function prepareRefundSubmission(input: {
    refundId: string;
    adminUserId: string;
    ipAddress?: string;
    userAgent?: string;
}): Promise<PreparedRefund> {
    return db.transaction(async (tx) => {
        /*
         * Read only the payment ID first so that we can acquire
         * locks in the correct order.
         */
        const initialRows = await tx
            .select({
                id: refundRequests.id,
                paymentId: refundRequests.paymentId,
            })
            .from(refundRequests)
            .where(
                eq(
                    refundRequests.id,
                    input.refundId,
                ),
            )
            .limit(1);

        const initialRefund = initialRows[0];

        if (!initialRefund) {
            throw createOperationalError(
                "Refund request not found.",
            );
        }

        await lockPaymentRefunds(
            tx,
            initialRefund.paymentId,
        );

        await lockRefundRequest(
            tx,
            input.refundId,
        );

        const lockedRows = await tx
            .select()
            .from(refundRequests)
            .where(
                eq(
                    refundRequests.id,
                    input.refundId,
                ),
            )
            .limit(1);

        const refund = lockedRows[0];

        if (!refund) {
            throw createOperationalError(
                "Refund request not found.",
            );
        }

        if (
            refund.paymentId !==
            initialRefund.paymentId
        ) {
            throw createOperationalError(
                "The refund's payment association changed during execution. Retry after investigating the record.",
            );
        }

        if (refund.status !== "APPROVED") {
            throw createOperationalError(
                `Only approved refunds can be submitted. Current status: ${refund.status}.`,
            );
        }

        if (refund.providerRefundId) {
            throw createOperationalError(
                "This refund already has a provider refund ID. Reconcile it instead of submitting a new refund.",
            );
        }

        const paymentRows = await tx
            .select()
            .from(payments)
            .where(
                and(
                    eq(
                        payments.id,
                        refund.paymentId,
                    ),
                    eq(
                        payments.userId,
                        refund.requestedBy,
                    ),
                ),
            )
            .limit(1);

        const payment = paymentRows[0];

        if (
            !payment ||
            payment.status !== "SUCCESS"
        ) {
            throw createOperationalError(
                "The original payment is not eligible for refund execution.",
            );
        }

        if (payment.provider !== SUPPORTED_PROVIDER) {
            throw createOperationalError(
                "Automated refund execution is only supported for Paystack payments.",
            );
        }

        if (
            normalizeCurrency(payment.currency) !==
            normalizeCurrency(refund.currency)
        ) {
            throw createOperationalError(
                "Refund currency does not match the original payment.",
            );
        }

        if (!payment.reference.trim()) {
            throw createOperationalError(
                "The original payment reference is missing.",
            );
        }

        /*
         * Use integer kobo for the balance calculation.
         *
         * PENDING requests also reserve balance because a
         * requester must not be able to create multiple
         * outstanding requests that collectively exceed the
         * original payment.
         */
        const existingRefunds = await tx
            .select({
                amount: refundRequests.amount,
                status: refundRequests.status,
            })
            .from(refundRequests)
            .where(
                eq(
                    refundRequests.paymentId,
                    refund.paymentId,
                ),
            );

        let reservedAmountKobo = 0;

        for (const existing of existingRefunds) {
            if (
                !(RESERVED_REFUND_STATUSES as readonly string[])
                    .includes(existing.status)
            ) {
                continue;
            }

            reservedAmountKobo += toKobo(
                existing.amount,
            );

            if (
                !Number.isSafeInteger(
                    reservedAmountKobo,
                )
            ) {
                throw createOperationalError(
                    "The reserved refund total exceeds the supported safe range.",
                );
            }
        }

        const paymentAmountKobo = toKobo(
            payment.amount,
        );

        if (
            reservedAmountKobo >
            paymentAmountKobo
        ) {
            throw createOperationalError(
                "The reserved refund total exceeds the original payment amount.",
            );
        }

        const refundAmountKobo = toPaystackSubunit(
            refund.amount,
            refund.currency,
        );

        if (
            refundAmountKobo >
            paymentAmountKobo
        ) {
            throw createOperationalError(
                "The refund amount exceeds the original payment amount.",
            );
        }

        /*
         * A reserved balance is a sum of the existing refund
         * requests. Because this request is already included
         * in that sum, compare the aggregate against the
         * original payment amount.
         */
        const updatedRows = await tx
            .update(refundRequests)
            .set({
                status: "PROCESSING",
                attemptCount: sql`
                    ${refundRequests.attemptCount} + 1
                `,
                lastError: null,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(
                        refundRequests.id,
                        input.refundId,
                    ),
                    eq(
                        refundRequests.status,
                        "APPROVED",
                    ),
                    sql`
                        ${refundRequests.providerRefundId}
                        IS NULL
                    `,
                ),
            )
            .returning();

        const updatedRefund = updatedRows[0];

        if (!updatedRefund) {
            throw createOperationalError(
                "Could not reserve this refund for processing.",
            );
        }

        await writeAuditRecord(tx, {
            ...auditMetadata(buildAuditContext(input)),
            action: "REFUND_SUBMISSION_STARTED",
            entityType: "REFUND",
            entityId: input.refundId,
            metadata: {
                paymentId: payment.id,
                paymentReference: payment.reference,
                amount: refund.amount,
                currency: refund.currency,
                amountSubunit: refundAmountKobo,
                attemptCount: updatedRefund.attemptCount,
            },
        });

        return {
            paymentId: payment.id,
            paymentReference: payment.reference,
            refundId: refund.id,
            amountSubunit: refundAmountKobo,
            currency: refund.currency,
            amount: refund.amount,
        };
    });
}

/*
 * ============================================================
 * EXECUTE OR RECONCILE REFUND
 * ============================================================
 */

export async function executeOrReconcileRefund(
    input: ExecuteRefundInput,
) {
    const {
        refundId,
        adminUserId,
        ipAddress,
        userAgent,
    } = input;

    if (!refundId || !adminUserId) {
        throw createOperationalError(
            "Refund ID and administrator ID are required.",
        );
    }

    /*
     * Read the current request before deciding whether the
     * operation is a submission or reconciliation.
     */
    const initialRows = await db
        .select()
        .from(refundRequests)
        .where(
            eq(
                refundRequests.id,
                refundId,
            ),
        )
        .limit(1);

    const initialRefund = initialRows[0];

    if (!initialRefund) {
        throw createOperationalError(
            "Refund request not found.",
        );
    }

    /*
     * If a provider ID exists, retrieve the specific provider
     * refund instead of submitting another one.
     */
    if (initialRefund.providerRefundId) {
        const providerResponse = await fetchPaystackRefund(
            initialRefund.providerRefundId,
        );

        if (
            !providerResponse.status ||
            !providerResponse.data
        ) {
            throw createOperationalError(
                "Paystack did not return refund status data.",
            );
        }

        if (
            String(providerResponse.data.id) !==
            initialRefund.providerRefundId
        ) {
            throw createOperationalError(
                "The Paystack refund ID did not match the requested refund.",
            );
        }

        return updateRefundFromProvider({
            refundId,
            adminUserId,
            providerRefundId: String(
                providerResponse.data.id,
            ),
            providerData: providerResponse.data,
            providerStatus: providerResponse.data.status,
            ...(ipAddress !== undefined
                ? { ipAddress }
                : {}),
            ...(userAgent !== undefined
                ? { userAgent }
                : {}),
        });
    }

    /*
     * PROCESSING with no provider ID is ambiguous.
     *
     * Never create a second provider refund automatically.
     */
    if (initialRefund.status === "PROCESSING") {
        return reconcileMissingProviderRefundId({
            refundId,
            adminUserId,
            ...(ipAddress !== undefined
                ? { ipAddress }
                : {}),
            ...(userAgent !== undefined
                ? { userAgent }
                : {}),
        });
    }

    /*
     * Only APPROVED can start a new provider submission.
     */
    if (initialRefund.status !== "APPROVED") {
        throw createOperationalError(
            `Only approved refunds can be submitted. Current status: ${initialRefund.status}.`,
        );
    }

    /*
     * Commit the reservation before contacting Paystack.
     */
    const prepared = await prepareRefundSubmission({
        refundId,
        adminUserId,
        ...(ipAddress !== undefined
            ? { ipAddress }
            : {}),
        ...(userAgent !== undefined
            ? { userAgent }
            : {}),
    });

    /*
     * The reservation has committed.
     *
     * An uncertain provider result must not cause an automatic
     * second POST.
     */
    try {
        const providerResponse = await createPaystackRefund({
            transactionReference:
                prepared.paymentReference,
            amountSubunit:
                prepared.amountSubunit,
            customerNote: "KARMASS refund",
            merchantNote:
                `KARMASS refund request ${prepared.refundId}`,
        });

        if (
            !providerResponse.status ||
            !providerResponse.data
        ) {
            throw createOperationalError(
                "Paystack did not confirm the refund submission. The request remains in PROCESSING for reconciliation.",
            );
        }

        const providerRefund =
            providerResponse.data;

        if (
            !Number.isSafeInteger(providerRefund.id) ||
            providerRefund.id <= 0
        ) {
            throw createOperationalError(
                "Paystack returned an invalid refund ID. The request remains in PROCESSING and requires reconciliation.",
            );
        }

        if (
            validateProviderAmount(
                providerRefund.amount,
            ) !== prepared.amountSubunit
        ) {
            throw createOperationalError(
                "Paystack returned a refund amount that does not match the requested amount. The request remains in PROCESSING for manual reconciliation.",
            );
        }

        if (
            normalizeCurrency(
                providerRefund.currency,
            ) !== normalizeCurrency(prepared.currency)
        ) {
            throw createOperationalError(
                "Paystack returned a refund currency that does not match the requested currency. The request remains in PROCESSING for manual reconciliation.",
            );
        }

        if (
            providerRefund.transaction.reference &&
            providerRefund.transaction.reference !==
                prepared.paymentReference
        ) {
            throw createOperationalError(
                "Paystack returned a refund associated with a different transaction reference. Manual reconciliation is required.",
            );
        }

        return await updateRefundFromProvider({
            refundId,
            adminUserId,
            providerRefundId: String(
                providerRefund.id,
            ),
            providerData: providerRefund,
            providerStatus: providerRefund.status,
            ...(ipAddress !== undefined
                ? { ipAddress }
                : {}),
            ...(userAgent !== undefined
                ? { userAgent }
                : {}),
        });
    } catch (error) {
        const message = getErrorMessage(error);

        /*
         * Preserve PROCESSING.
         *
         * Even a provider validation error may happen after
         * Paystack accepted the POST. Never assume that the
         * provider did not create a refund.
         */
        await db
            .update(refundRequests)
            .set({
                lastError: message.slice(0, 2000),
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(
                        refundRequests.id,
                        refundId,
                    ),
                    eq(
                        refundRequests.status,
                        "PROCESSING",
                    ),
                ),
            );

        throw createOperationalError(
            "Refund submission could not be fully confirmed. The request remains in PROCESSING and must be reconciled with Paystack before any retry. Details: " +
                message,
        );
    }
}