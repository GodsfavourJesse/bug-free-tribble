import {
    and,
    eq,
    isNull,
    lte,
    or,
} from "drizzle-orm";

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
          reason: "IN_PROGRESS" | "NOT_STARTED";
      };

type JsonObject = Record<string, unknown>;

function toJsonObject(value: unknown): JsonObject {
    if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
    ) {
        return {};
    }

    return value as JsonObject;
}

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
                eq(payments.status, "STARTED"),
                or(
                    isNull(payments.initializationExpiresAt),
                    lte(payments.initializationExpiresAt, now),
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

    const currentRows = await db
        .select({
            status: payments.status,
            purpose: payments.purpose,
        })
        .from(payments)
        .where(eq(payments.id, paymentId))
        .limit(1);

    const currentPayment = currentRows[0];

    if (
        !currentPayment ||
        currentPayment.status !== "STARTED" ||
        currentPayment.purpose !== "BOOST"
    ) {
        return {
            acquired: false,
            reason: "NOT_STARTED",
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
    /*
     * Read the existing metadata first.
     *
     * This is important because providerData may already contain
     * the immutable boost purchase snapshot.
     */
    const existingRows = await db
        .select({
            providerData: payments.providerData,
        })
        .from(payments)
        .where(
            and(
                eq(payments.id, paymentId),
                eq(payments.purpose, "BOOST"),
                eq(payments.status, "STARTED"),
                eq(payments.initializationToken, token),
            ),
        )
        .limit(1);

    const existingPayment = existingRows[0];

    if (!existingPayment) {
        return false;
    }

    const existingProviderData = toJsonObject(
        existingPayment.providerData,
    );

    const gatewayData = toJsonObject(providerData);

    /*
     * Keep the original internal purchase snapshot.
     *
     * Paystack initialization fields are merged into the existing
     * metadata rather than replacing it.
     */
    const mergedProviderData: JsonObject = {
        ...existingProviderData,
        ...gatewayData,
    };

    /*
     * Preserve the internal snapshot explicitly.
     *
     * The gateway response must never replace it.
     */
    if ("purchaseSnapshot" in existingProviderData) {
        mergedProviderData.purchaseSnapshot =
            existingProviderData.purchaseSnapshot;
    }

    const result = await db
        .update(payments)
        .set({
            providerData: mergedProviderData,
            initializationToken: null,
            initializationExpiresAt: null,
            updatedAt: new Date(),
        })
        .where(
            and(
                eq(payments.id, paymentId),
                eq(payments.purpose, "BOOST"),
                eq(payments.status, "STARTED"),
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
                eq(payments.purpose, "BOOST"),
                eq(payments.status, "STARTED"),
                eq(payments.initializationToken, token),
            ),
        );
}