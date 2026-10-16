import {
    and,
    eq,
    sql,
} from "drizzle-orm";

import { db } from "../../../database/index.ts";

import {
    payments,
    refundRequests,
} from "../../../database/schema/index.ts";

import { writeAuditRecord } from "../../../helpers/audit/audit.service.ts";

export async function requestRefund(input: {
    userId: string;
    paymentId: string;
    amount?: number;
    reason: string;
    idempotencyKey: string;
    ipAddress?: string;
    userAgent?: string;
}) {
    const {
        userId,
        paymentId,
        amount,
        reason,
        idempotencyKey,
        ipAddress,
        userAgent,
    } = input;

    if (!userId || !paymentId) {
        throw new Error(
            "User ID and payment ID are required.",
        );
    }

    if (!reason.trim()) {
        throw new Error(
            "A refund reason is required.",
        );
    }

    if (
        reason.trim().length > 1000 ||
        idempotencyKey.trim().length === 0 ||
        idempotencyKey.trim().length > 120
    ) {
        throw new Error(
            "Refund reason or idempotency key is invalid.",
        );
    }

    return db.transaction(async (tx) => {
        /*
         * Serialize refund requests for the same payment.
         */
        await tx.execute(sql`
            SELECT pg_advisory_xact_lock(
                hashtext(
                    ${`karmass:refund:${paymentId}`}
                )
            )
        `);

        /*
         * Idempotent retry: return the existing request.
         */
        const existingRequest = await tx
            .select()
            .from(refundRequests)
            .where(
                eq(
                    refundRequests.idempotencyKey,
                    idempotencyKey.trim(),
                ),
            )
            .limit(1);

        if (existingRequest[0]) {
            if (
                existingRequest[0].requestedBy !== userId ||
                existingRequest[0].paymentId !== paymentId
            ) {
                throw new Error(
                    "This idempotency key has already been used.",
                );
            }

            return existingRequest[0];
        }

        const paymentRows = await tx
            .select()
            .from(payments)
            .where(
                and(
                    eq(payments.id, paymentId),
                    eq(payments.userId, userId),
                ),
            )
            .limit(1);

        const payment = paymentRows[0];

        if (!payment) {
            throw new Error(
                "Payment not found.",
            );
        }

        if (payment.status !== "SUCCESS") {
            throw new Error(
                "Only successful payments are eligible for a refund request.",
            );
        }

        const originalAmount = Number(payment.amount);

        const requestedAmount =
            amount === undefined
                ? originalAmount
                : amount;

        if (
            !Number.isFinite(requestedAmount) ||
            requestedAmount <= 0 ||
            requestedAmount > originalAmount
        ) {
            throw new Error(
                "Refund amount must be positive and cannot exceed the original payment amount.",
            );
        }

        /*
         * Only one unresolved refund request may exist for a
         * payment at a time.
         *
         * Existing successful refunds count against the
         * remaining refundable balance.
         */
        const refundRows = await tx
            .select({
                amount: refundRequests.amount,
                status: refundRequests.status,
            })
            .from(refundRequests)
            .where(
                eq(
                    refundRequests.paymentId,
                    paymentId,
                ),
            );

        let refundedOrReservedAmount = 0;

        for (const refund of refundRows) {
            if (
                refund.status === "SUCCESS" ||
                refund.status === "PENDING" ||
                refund.status === "APPROVED" ||
                refund.status === "PROCESSING"
            ) {
                refundedOrReservedAmount +=
                    Number(refund.amount);
            }
        }

        const remainingAmount =
            originalAmount - refundedOrReservedAmount;

        if (requestedAmount > remainingAmount) {
            throw new Error(
                "Requested refund exceeds the remaining refundable balance.",
            );
        }

        const unresolvedRequest = refundRows.some(
            (refund) =>
                refund.status === "PENDING" ||
                refund.status === "APPROVED" ||
                refund.status === "PROCESSING",
        );

        if (unresolvedRequest) {
            throw new Error(
                "An unresolved refund request already exists for this payment.",
            );
        }

        const insertedRows = await tx
            .insert(refundRequests)
            .values({
                paymentId,
                requestedBy: userId,
                status: "PENDING",
                amount: requestedAmount.toFixed(2),
                currency: payment.currency,
                reason: reason.trim(),
                idempotencyKey: idempotencyKey.trim(),
            })
            .returning();

        const refund = insertedRows[0];

        if (!refund) {
            throw new Error(
                "Unable to create refund request.",
            );
        }

        await writeAuditRecord(tx, {
            actorUserId: userId,
            action: "REFUND_REQUESTED",
            entityType: "REFUND",
            entityId: refund.id,
            ipAddress: ipAddress ?? null,
            userAgent: userAgent ?? null,
            metadata: {
                paymentId,
                amount: requestedAmount.toFixed(2),
                currency: payment.currency,
                reason: reason.trim(),
            },
        });

        return refund;
    });
}