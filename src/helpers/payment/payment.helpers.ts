import {
    createHmac,
    randomBytes,
    timingSafeEqual,
} from "node:crypto";

import { eq } from "drizzle-orm";

import { env } from "../../config/env.ts";

import { db } from "../../database/index.ts";

import { users } from "../../database/schema/index.ts";

import type {
    PaymentProviderData,
} from "../../modules/payment-module/payment.types.ts";

export function createPaymentReference(
    prefix: string,
): string {
    return `${prefix}-${Date.now()}-${randomBytes(6).toString("hex")}`;
}

export function amountToSubunit(
    amount: number,
    currency: string,
): number {
    /*
     * KARMASS currently uses currencies where
     * Paystack expects the amount in the smallest
     * currency unit.
     *
     * NGN -> kobo.
     */
    const multiplier =
        currency.toUpperCase() === "NGN"
            ? 100
            : 100;

    const subunit =
        Math.round(
            amount * multiplier,
        );

    if (
        !Number.isSafeInteger(
            subunit,
        ) ||
        subunit <= 0
    ) {
        throw new Error(
            "Invalid payment amount.",
        );
    }

    return subunit;
}

export async function getUserEmail(
    userId: string,
): Promise<string> {
    const result =
        await db
            .select({
                email: users.email,
            })
            .from(users)
            .where(
                eq(
                    users.id,
                    userId,
                ),
            )
            .limit(1);

    const user =
        result[0];

    if (!user) {
        throw new Error(
            "User not found.",
        );
    }

    return user.email;
}

export function getProviderData(
    value: unknown,
): PaymentProviderData {
    if (
        typeof value !== "object" ||
        value === null
    ) {
        return null;
    }

    const record =
        value as Record<
            string,
            unknown
        >;

    const result: NonNullable<
        PaymentProviderData
    > = {};

    if (
        typeof record.authorization_url ===
        "string"
    ) {
        result.authorization_url =
            record.authorization_url;
    }

    if (
        typeof record.access_code ===
        "string"
    ) {
        result.access_code =
            record.access_code;
    }

    if (
        typeof record.reference ===
        "string"
    ) {
        result.reference =
            record.reference;
    }

    return result;
}

export function isPaystackSignatureValid(
    rawBody: Buffer,
    signature: string,
): boolean {
    if (
        !signature ||
        !env.PAYSTACK_SECRET_KEY
    ) {
        return false;
    }

    const expected =
        createHmac(
            "sha512",
            env.PAYSTACK_SECRET_KEY,
        )
            .update(rawBody)
            .digest("hex");

    const expectedBuffer =
        Buffer.from(
            expected,
            "utf8",
        );

    const actualBuffer =
        Buffer.from(
            signature,
            "utf8",
        );

    if (
        expectedBuffer.length !==
        actualBuffer.length
    ) {
        return false;
    }

    return timingSafeEqual(
        expectedBuffer,
        actualBuffer,
    );
}

export function mapGatewayStatus(
    gatewayStatus: string,
) {
    if (
        gatewayStatus ===
        "abandoned"
    ) {
        return "ABANDONED" as const;
    }

    if (
        gatewayStatus ===
        "reversed"
    ) {
        return "REVERSED" as const;
    }

    if (
        gatewayStatus ===
        "failed"
    ) {
        return "FAILED" as const;
    }

    return "PROCESSING" as const;
}