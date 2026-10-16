import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "../../../database/index.ts";
import { payments } from "../../../database/schema/index.ts";

const INITIALIZATION_LEASE_MS = 90_000;

export type BoostPaymentInitializationClaim =
    | {
        acquired: true;
        token: string;
    }
    | {
        acquired: false;
        reason: "IN_PROGRESS" | "NOT_PENDING";
    };

export async function claimBoostPaymentInitialization(
    paymentId: string,
): Promise<BoostPaymentInitializationClaim> {
    const token = randomUUID();
    const now = new Date();
    const expiresAt = new Date(
        now.getTime() + INITIALIZATION_LEASE_MS,
    );

    const result = await db
        .update(payments)
        .set({
            initializationToken: token,
            initializationExpiresAt: expiresAt,
            updatedAt: now,
        })
        .where(
            and(
                eq(payments.id, paymentId),
                eq(payments.purpose, "BOOST"),
                eq(payments.status, "PENDING"),
                or(
                    isNull(payments.initializationExpiresAt),
                    lt(payments.initializationExpiresAt, now),
                ),
            ),
        )
        .returning({
            id: payments.id,
        });

    if (result[0]) {
        return {
            acquired: true,
            token,
        };
    }

    const current = await db
        .select({
            status: payments.status,
            leaseExpiresAt: payments.initializationExpiresAt,
        })
        .from(payments)
        .where(eq(payments.id, paymentId))
        .limit(1);

    const payment = current[0];

    if (!payment || payment.status !== "PENDING") {
        return {
            acquired: false,
            reason: "NOT_PENDING",
        };
    }

    return {
        acquired: false,
        reason: "IN_PROGRESS",
    };
}

export async function saveBoostPaymentInitialization(
    paymentId: string,
    token: string,
    providerData: unknown,
): Promise<boolean> {
    const result = await db
        .update(payments)
        .set({
            providerData,
            initializationToken: null,
            initializationExpiresAt: null,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(payments.id, paymentId),
                eq(payments.status, "PENDING"),
                eq(payments.initializationToken, token),
            ),
        )
        .returning({
            id: payments.id,
        });

    return Boolean(result[0]);
}

export async function releaseBoostPaymentInitialization(
    paymentId: string,
    token: string,
): Promise<void> {
    await db
        .update(payments)
        .set({
            initializationToken: null,
            initializationExpiresAt: null,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(payments.id, paymentId),
                eq(payments.status, "PENDING"),
                eq(payments.initializationToken, token),
            ),
        );
}