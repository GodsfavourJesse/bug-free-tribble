import type { Request, Response } from "express";

import {
    initializeBoostPayment,
    initializeSubscriptionPayment,
    listUserPayments,
    verifyAndFulfillPayment,
} from "./payment.service.ts";

import {
    initializeBoostPaymentSchema,
    initializeSubscriptionPaymentSchema,
    verifyPaymentSchema,
} from "./payment.validation.ts";

import { isPaystackSignatureValid } from "../../helpers/payment/payment.helpers.ts";

import { persistPaystackEvent } from "./payment-event/payment-event.ingestion.service.ts";

function getErrorMessage(error: unknown): string {
    return error instanceof Error
        ? error.message
        : "An unexpected error occurred.";
}

function parsePositiveInteger(
    value: unknown,
    defaultValue: number,
    maximum: number,
): number | null {
    if (value === undefined) {
        return defaultValue;
    }

    if (
        typeof value !== "string" ||
        value.trim() === "" ||
        !/^\d+$/.test(value)
    ) {
        return null;
    }

    const parsed = Number(value);

    if (
        !Number.isSafeInteger(parsed) ||
        parsed < 1 ||
        parsed > maximum
    ) {
        return null;
    }

    return parsed;
}

/**
 * Initialize a subscription payment.
 */
export async function initializeSubscription(
    request: Request,
    response: Response,
): Promise<void> {
    const validation = initializeSubscriptionPaymentSchema.safeParse(
        request.body,
    );

    if (!validation.success) {
        response.status(400).json({
            success: false,
            message: "Invalid subscription payment request.",
            errors: validation.error.flatten(),
        });
        return;
    }

    try {
        const result = await initializeSubscriptionPayment(
            request.user!.id,
            validation.data.planId,
        );

        response.status(201).json({
            success: true,
            message: "Subscription payment initialized successfully.",
            data: result,
        });
    } catch (error: unknown) {
        response.status(400).json({
            success: false,
            message: getErrorMessage(error),
        });
    }
}

/**
 * Initialize a listing boost payment.
 */
export async function initializeBoost(
    request: Request,
    response: Response,
): Promise<void> {
    const validation = initializeBoostPaymentSchema.safeParse(
        request.body,
    );

    if (!validation.success) {
        response.status(400).json({
            success: false,
            message: "Invalid listing boost payment request.",
            errors: validation.error.flatten(),
        });
        return;
    }

    try {
        const result = await initializeBoostPayment(
            request.user!.id,
            validation.data.boostId,
        );

        response.status(201).json({
            success: true,
            message: "Listing boost payment initialized successfully.",
            data: result,
        });
    } catch (error: unknown) {
        response.status(400).json({
            success: false,
            message: getErrorMessage(error),
        });
    }
}

/**
 * Verify a payment and fulfill it if payment is confirmed.
 */
export async function verifyPayment(
    request: Request,
    response: Response,
): Promise<void> {
    const validation = verifyPaymentSchema.safeParse(
        request.body,
    );

    if (!validation.success) {
        response.status(400).json({
            success: false,
            message: "Invalid payment verification request.",
            errors: validation.error.flatten(),
        });
        return;
    }

    try {
        const result = await verifyAndFulfillPayment(
            request.user!.id,
            validation.data.reference,
        );

        response.status(200).json({
            success: true,
            message: "Payment verification completed.",
            data: result,
        });
    } catch (error: unknown) {
        response.status(400).json({
            success: false,
            message: getErrorMessage(error),
        });
    }
}

/**
 * Return the authenticated user's payment history.
 *
 * Defaults:
 * - page: 1
 * - limit: 20
 *
 * Maximum limit: 100
 */
export async function history(
    request: Request,
    response: Response,
): Promise<void> {
    const page = parsePositiveInteger(
        request.query.page,
        1,
        Number.MAX_SAFE_INTEGER,
    );

    const limit = parsePositiveInteger(
        request.query.limit,
        20,
        100,
    );

    if (page === null || limit === null) {
        response.status(400).json({
            success: false,
            message:
                "Invalid pagination parameters. Page must be a positive integer and limit must be between 1 and 100.",
        });
        return;
    }

    const offset = (page - 1) * limit;

    if (!Number.isSafeInteger(offset)) {
        response.status(400).json({
            success: false,
            message: "The requested page is too large.",
        });
        return;
    }

    try {
        const result = await listUserPayments(
            request.user!.id,
            limit,
            offset,
        );

        response.status(200).json({
            success: true,
            message: "Payment history retrieved successfully.",
            data: result,
        });
    } catch (error: unknown) {
        response.status(500).json({
            success: false,
            message: getErrorMessage(error),
        });
    }
}

/**
 * Receive Paystack webhook events.
 *
 * The signature is verified against the original request body before
 * the event is persisted for asynchronous processing.
 */
export async function webhook(
    request: Request,
    response: Response,
): Promise<void> {
    const rawBody = request.rawBody;
    const signature = request.get("x-paystack-signature");

    if (!rawBody || !signature) {
        response.status(401).json({
            success: false,
            message:
                "Missing Paystack webhook signature or raw request body.",
        });
        return;
    }

    if (!isPaystackSignatureValid(rawBody, signature)) {
        response.status(401).json({
            success: false,
            message: "Invalid Paystack webhook signature.",
        });
        return;
    }

    let payload: unknown;

    try {
        payload = JSON.parse(rawBody.toString("utf8")) as unknown;
    } catch {
        response.status(400).json({
            success: false,
            message: "Invalid JSON in Paystack webhook payload.",
        });
        return;
    }

    if (
        typeof payload !== "object" ||
        payload === null ||
        !("event" in payload) ||
        !("data" in payload) ||
        typeof payload.event !== "string" ||
        typeof payload.data !== "object" ||
        payload.data === null
    ) {
        response.status(400).json({
            success: false,
            message: "Invalid Paystack webhook payload structure.",
        });
        return;
    }

    const eventType = payload.event;
    const data = payload.data;

    if (
        !("reference" in data) ||
        typeof data.reference !== "string" ||
        data.reference.trim() === ""
    ) {
        response.status(400).json({
            success: false,
            message:
                "Paystack webhook payload is missing a valid payment reference.",
        });
        return;
    }

    const reference = data.reference;

    let providerEventId: string | undefined;

    if (
        "id" in payload &&
        (typeof payload.id === "string" ||
            typeof payload.id === "number")
    ) {
        providerEventId = String(payload.id);
    }

    let transactionId: string | number | undefined;

    if (
        "id" in data &&
        (typeof data.id === "string" ||
            typeof data.id === "number")
    ) {
        transactionId = data.id;
    }

    try {
        const persisted = await persistPaystackEvent({
            eventType,
            reference,
            transactionId,
            ...(providerEventId ? { providerEventId } : {}),
            payload,
        });

        response.status(200).json({
            success: true,
            received: true,
            duplicate: persisted.duplicate,
        });
    } catch (error: unknown) {
        console.error(
            "Paystack webhook persistence failed:",
            error,
        );

        response.status(500).json({
            success: false,
            message:
                "Unable to persist the Paystack webhook event.",
        });
    }
}