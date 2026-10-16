import {
    and,
    eq,
    sql,
} from "drizzle-orm";

import { db } from "../../../../database/index.ts";

import {
    payments,
    refundRequests,
} from "../../../../database/schema/index.ts";

import { writeAuditRecord } from "../../../../helpers/audit/audit.service.ts";

type RefundDecision = "APPROVED" | "REJECTED";

interface ReviewRefundInput {
    refundId: string;
    adminUserId: string;
    decision: RefundDecision;
    reviewNote?: string;
    ipAddress?: string;
    userAgent?: string;
}

export async function reviewRefundRequest(
    input: ReviewRefundInput,
) {
    const {
        refundId,
        adminUserId,
        decision,
        reviewNote,
        ipAddress,
        userAgent,
    } = input;

    if (!refundId || !adminUserId) {
        throw new Error(
            "Refund ID and administrator ID are required.",
        );
    }

    if (
        decision !== "APPROVED" &&
        decision !== "REJECTED"
    ) {
        throw new Error("Invalid refund decision.");
    }

    const normalizedNote = reviewNote?.trim();

    if (
        normalizedNote !== undefined &&
        normalizedNote.length > 1000
    ) {
        throw new Error(
            "Review note cannot exceed 1000 characters.",
        );
    }

    return db.transaction(async (tx) => {
        /*
         * First read the refund to identify its payment.
         * This read is only used to determine which payment lock
         * to acquire. The refund is re-read after locking.
         */
        const initialRows = await tx
            .select({
                id: refundRequests.id,
                paymentId: refundRequests.paymentId,
            })
            .from(refundRequests)
            .where(eq(refundRequests.id, refundId))
            .limit(1);

        const initialRefund = initialRows[0];

        if (!initialRefund) {
            throw new Error("Refund request not found.");
        }

        /*
         * Lock order is payment first, refund second.
         *
         * Refund creation, approval, and execution must use the
         * same payment-level lock when reserving refund balances.
         */
        await tx.execute(sql`
            SELECT pg_advisory_xact_lock(
                hashtext(
                    ${`karmass:refund:${initialRefund.paymentId}`}
                )
            )
        `);

        await tx.execute(sql`
            SELECT pg_advisory_xact_lock(
                hashtext(
                    ${`karmass:refund-request:${refundId}`}
                )
            )
        `);

        const refundRows = await tx
            .select()
            .from(refundRequests)
            .where(eq(refundRequests.id, refundId))
            .limit(1);

        const refund = refundRows[0];

        if (!refund) {
            throw new Error("Refund request not found.");
        }

        if (refund.paymentId !== initialRefund.paymentId) {
            throw new Error(
                "Refund payment association changed unexpectedly.",
            );
        }

        if (refund.status !== "PENDING") {
            throw new Error(
                `Only pending refund requests can be reviewed. Current status: ${refund.status}.`,
            );
        }

        const paymentRows = await tx
            .select()
            .from(payments)
            .where(
                and(
                    eq(payments.id, refund.paymentId),
                    eq(payments.userId, refund.requestedBy),
                ),
            )
            .limit(1);

        const payment = paymentRows[0];

        if (!payment) {
            throw new Error(
                "The original payment could not be found.",
            );
        }

        if (payment.status !== "SUCCESS") {
            throw new Error(
                "The original payment is no longer eligible for a refund.",
            );
        }

        if (
            decision === "APPROVED" &&
            payment.currency !== refund.currency
        ) {
            throw new Error(
                "Refund currency does not match the original payment.",
            );
        }

        /*
         * The requested refund is included in this total.
         * All unresolved and successful refunds reserve funds.
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

        let reservedAmount = 0;

        for (const item of existingRefunds) {
            if (
                item.status === "SUCCESS" ||
                item.status === "PENDING" ||
                item.status === "APPROVED" ||
                item.status === "PROCESSING"
            ) {
                reservedAmount += Number(item.amount);
            }
        }

        if (
            decision === "APPROVED" &&
            reservedAmount > Number(payment.amount)
        ) {
            throw new Error(
                "Refund approval would exceed the original payment amount.",
            );
        }

        const updatedRows = await tx
            .update(refundRequests)
            .set({
                status: decision,
                reviewedBy: adminUserId,
                reviewNote: normalizedNote ?? null,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(refundRequests.id, refundId),
                    eq(refundRequests.status, "PENDING"),
                ),
            )
            .returning();

        const updatedRefund = updatedRows[0];

        if (!updatedRefund) {
            throw new Error(
                "Refund review failed. Refresh and check the request status.",
            );
        }

        await writeAuditRecord(tx, {
            actorUserId: adminUserId,
            action: decision === "APPROVED" ? "REFUND_APPROVED" : "REFUND_REJECTED",
            entityType: "REFUND",
            entityId: refundId,
            ipAddress: ipAddress ?? null,
            userAgent: userAgent ?? null,
            metadata: {
                paymentId: refund.paymentId,
                requestedBy: refund.requestedBy,
                amount: refund.amount,
                currency: refund.currency,
                decision,
                reviewNote: normalizedNote ?? null,
            },
        });

        return updatedRefund;
    });
}