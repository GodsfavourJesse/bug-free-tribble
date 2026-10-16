import {
    and,
    desc,
    eq,
    ilike,
    or,
    sql,
} from "drizzle-orm";

import { db } from "../../../../database/index.ts";

import {
    paymentReconciliations,
    payments,
    refundRequests,
    users,
} from "../../../../database/schema/index.ts";

import { AppError } from "../../../../errors/app-error.ts";
import { writeAudit } from "../../admin.service.ts";

const PAYMENT_STATUSES = [
    "PENDING",
    "SUCCESS",
    "FAILED",
    "ABANDONED",
    "REVERSED",
    "PROCESSING",
] as const;

type PaymentStatus = typeof PAYMENT_STATUSES[number];
type PaymentPurpose = "SUBSCRIPTION" | "BOOST";

export async function listPayments(input: {
    limit?: number;
    page?: number;
    status?: PaymentStatus;
    purpose?: PaymentPurpose;
    search?: string;
} = {}) {
    const limit = Math.min(Math.max(Math.floor(input.limit ?? 20), 1), 100);
    const page = Math.max(Math.floor(input.page ?? 1), 1);
    const offset = (page - 1) * limit;
    const filters = [];

    if (input.status) filters.push(eq(payments.status, input.status));
    if (input.purpose) filters.push(eq(payments.purpose, input.purpose));

    if (input.search) {
        const pattern = `%${input.search}%`;
        filters.push(or(
            ilike(payments.reference, pattern),
            ilike(payments.gatewayTransactionId, pattern),
            ilike(users.email, pattern),
            ilike(users.firstName, pattern),
            ilike(users.lastName, pattern),
        )!);
    }

    const where = filters.length ? and(...filters) : undefined;

    const [items, countRows] = await Promise.all([
        db.select({
            payment: payments,
            customer: {
                id: users.id,
                email: users.email,
                firstName: users.firstName,
                lastName: users.lastName,
            },
        })
            .from(payments)
            .innerJoin(users, eq(users.id, payments.userId))
            .where(where)
            .orderBy(desc(payments.createdAt))
            .limit(limit)
            .offset(offset),
        db.select({ count: sql<number>`count(*)::int` })
            .from(payments)
            .innerJoin(users, eq(users.id, payments.userId))
            .where(where),
    ]);

    const total = Number(countRows[0]?.count ?? 0);

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

export async function listRefundRequests(input: {
    page: number;
    limit: number;
    status?: "PENDING" | "APPROVED" | "PROCESSING" | "SUCCESS" | "FAILED" | "REJECTED";
}) {
    const where = input.status
        ? eq(refundRequests.status, input.status)
        : undefined;
    const offset = (input.page - 1) * input.limit;

    const [items, countRows] = await Promise.all([
        db.select({
            refund: refundRequests,
            payment: {
                id: payments.id,
                reference: payments.reference,
                status: payments.status,
                amount: payments.amount,
                currency: payments.currency,
            },
            requester: {
                id: users.id,
                email: users.email,
                firstName: users.firstName,
                lastName: users.lastName,
            },
        })
            .from(refundRequests)
            .innerJoin(payments, eq(payments.id, refundRequests.paymentId))
            .innerJoin(users, eq(users.id, refundRequests.requestedBy))
            .where(where)
            .orderBy(desc(refundRequests.createdAt))
            .limit(input.limit)
            .offset(offset),
        db.select({ count: sql<number>`count(*)::int` })
            .from(refundRequests)
            .where(where),
    ]);

    const total = Number(countRows[0]?.count ?? 0);

    return {
        items,
        pagination: {
            page: input.page,
            limit: input.limit,
            total,
            totalPages: Math.ceil(total / input.limit),
        },
    };
}

export async function listPaymentReconciliations(input: {
    page: number;
    limit: number;
    status?: "PENDING" | "PROCESSING" | "RETRY" | "RESOLVED" | "DEAD_LETTER" | "IGNORED";
}) {
    const where = input.status
        ? eq(paymentReconciliations.status, input.status)
        : undefined;
    const offset = (input.page - 1) * input.limit;

    const [items, countRows] = await Promise.all([
        db.select({
            reconciliation: paymentReconciliations,
            payment: {
                id: payments.id,
                reference: payments.reference,
                status: payments.status,
                amount: payments.amount,
                currency: payments.currency,
                provider: payments.provider,
            },
        })
            .from(paymentReconciliations)
            .innerJoin(payments, eq(payments.id, paymentReconciliations.paymentId))
            .where(where)
            .orderBy(desc(paymentReconciliations.updatedAt))
            .limit(input.limit)
            .offset(offset),
        db.select({ count: sql<number>`count(*)::int` })
            .from(paymentReconciliations)
            .where(where),
    ]);

    const total = Number(countRows[0]?.count ?? 0);

    return {
        items,
        pagination: {
            page: input.page,
            limit: input.limit,
            total,
            totalPages: Math.ceil(total / input.limit),
        },
    };
}

/**
 * Re-queues a dead-letter reconciliation for the existing worker.
 * This does not call Paystack directly and never marks a payment successful.
 */
export async function retryPaymentReconciliation(input: {
    reconciliationId: string;
    adminId: string;
    ipAddress?: string;
    userAgent?: string;
}) {
    return db.transaction(async (tx) => {
        const rows = await tx.select()
            .from(paymentReconciliations)
            .where(eq(paymentReconciliations.id, input.reconciliationId))
            .for("update")
            .limit(1);

        const record = rows[0];

        if (!record) {
            throw new AppError("Payment reconciliation record not found.", 404, "RECONCILIATION_NOT_FOUND");
        }

        if (!["DEAD_LETTER", "RETRY"].includes(record.status)) {
            throw new AppError(
                "Only DEAD_LETTER or RETRY reconciliation records can be manually re-queued.",
                409,
                "RECONCILIATION_NOT_RETRYABLE",
            );
        }

        const now = new Date();

        const updatedRows = await tx.update(paymentReconciliations)
            .set({
                status: "RETRY",
                nextAttemptAt: now,
                lockedUntil: null,
                lockedBy: null,
                lastErrorCode: null,
                lastErrorMessage: null,
                updatedAt: now,
            })
            .where(eq(paymentReconciliations.id, record.id))
            .returning();

        const updated = updatedRows[0];

        if (!updated) {
            throw new AppError("Unable to re-queue reconciliation.", 500, "RECONCILIATION_RETRY_FAILED");
        }

        await writeAudit(tx, {
            actorUserId: input.adminId,
            action: "PAYMENT_RECONCILIATION_REQUEUED",
            entityType: "PAYMENT_RECONCILIATION",
            entityId: record.id,
            ...(input.ipAddress !== undefined ? { ipAddress: input.ipAddress } : {}),
            ...(input.userAgent !== undefined ? { userAgent: input.userAgent } : {}),
            metadata: {
                paymentId: record.paymentId,
                previousStatus: record.status,
                newStatus: updated.status,
            },
        });

        return updated;
    });
}

export function isPaymentStatus(value: string): value is PaymentStatus {
    return (PAYMENT_STATUSES as readonly string[]).includes(value);
}
