import { env, isPaystackConfigured } from "../../../config/env.ts";

interface PaystackInitializeResponse {
    status: boolean;
    message: string;
    data?: {
        authorization_url: string;
        access_code: string;
        reference: string;
    };
}

export interface PaystackRefundResponse {
    status: boolean;
    message: string;
    data?: {
        id: number;
        integration: number;
        domain: string;
        transaction: {
            id: number;
            reference: string;
        };
        dispute?: number | null;
        amount: number;
        currency: string;
        status: string;
        refunded_at?: string | null;
        expected_at?: string | null;
        created_at?: string;
        updated_at?: string;
    };
}

export interface PaystackRefundStatusResponse {
    status: boolean;
    message: string;
    data?: {
        id: number;
        transaction: number | {
            id?: number;
            reference?: string;
        };
        amount: number;
        currency: string;
        status: string;
        refunded_at?: string | null;
        expected_at?: string | null;
        createdAt?: string;
        updatedAt?: string;
    };
}

export interface PaystackRefundListItem {
    id: number;
    transaction: number | {
        id?: number;
        reference?: string;
    };
    amount: number;
    currency: string;
    status: string;
    merchant_note?: string | null;
    customer_note?: string | null;
    refunded_at?: string | null;
    expected_at?: string | null;
    created_at?: string;
    updated_at?: string;

    // Some individual refund responses use camelCase.
    createdAt?: string;
    updatedAt?: string;
}

export interface PaystackRefundListResponse {
    status: boolean;
    message: string;
    data?: PaystackRefundListItem[];
    meta?: {
        total?: number;
        skipped?: number;
        perPage?: number;
        page?: number;
        pageCount?: number;
    };
}

export interface PaystackTransactionData {
    id: number;
    status: string;
    reference: string;
    amount: number;
    currency: string;
    paid_at?: string | null;
    metadata?: unknown;
    gateway_response?: string | null;
    channel?: string | null;
}

interface PaystackVerifyResponse {
    status: boolean;
    message: string;
    data?: PaystackTransactionData;
}

function requirePaystack(): void {
    if (!isPaystackConfigured()) {
        throw new Error(
            "Paystack is not configured. Add PAYSTACK_SECRET_KEY to the environment.",
        );
    }
}

async function paystackRequest<T>(
    path: string,
    init: RequestInit,
): Promise<T> {
    requirePaystack();

    const response = await fetch(
        `https://api.paystack.co${path}`,
        {
            ...init,
            headers: {
                Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
                "Content-Type": "application/json",
                ...(init.headers ?? {}),
            },
        },
    );

    const body = (await response.json()) as T & {
        message?: string;
    };

    if (!response.ok) {
        throw new Error(
            body.message ??
                `Paystack request failed with HTTP ${response.status}.`,
        );
    }

    return body;
}

export async function initializePaystackTransaction(input: {
    email: string;
    amountSubunit: number;
    currency: string;
    reference: string;
    metadata: Record<string, unknown>;
}): Promise<PaystackInitializeResponse> {
    // Paystack expects monetary amounts in the currency's subunit, such as kobo for NGN.
    return paystackRequest<PaystackInitializeResponse>(
        "/transaction/initialize",
        {
            method: "POST",
            body: JSON.stringify({
                email: input.email,
                amount: input.amountSubunit,
                currency: input.currency,
                reference: input.reference,
                callback_url: `${env.CLIENT_URL}/payments/callback`,
                metadata: JSON.stringify(input.metadata),
            }),
        },
    );
}

export async function verifyPaystackTransaction(
    reference: string,
): Promise<PaystackVerifyResponse> {
    return paystackRequest<PaystackVerifyResponse>(
        `/transaction/verify/${encodeURIComponent(reference)}`,
        {
            method: "GET",
        },
    );
}

export async function createPaystackRefund(input: {
    transactionReference: string;
    amountSubunit?: number;
    customerNote?: string;
    merchantNote?: string;
}): Promise<PaystackRefundResponse> {
    const transactionReference =
        input.transactionReference.trim();

    if (!transactionReference) {
        throw new Error(
            "A transaction reference is required to issue a refund.",
        );
    }

    if (
        input.amountSubunit !== undefined &&
        (
            !Number.isSafeInteger(input.amountSubunit) ||
            input.amountSubunit <= 0
        )
    ) {
        throw new Error(
            "Refund amount must be a positive safe integer in the currency's subunit.",
        );
    }

    const body: {
        transaction: string;
        amount?: number;
        customer_note?: string;
        merchant_note?: string;
    } = {
        transaction: transactionReference,
    };

    if (input.amountSubunit !== undefined) {
        body.amount = input.amountSubunit;
    }

    if (input.customerNote !== undefined) {
        body.customer_note = input.customerNote;
    }

    if (input.merchantNote !== undefined) {
        body.merchant_note = input.merchantNote;
    }

    return paystackRequest<PaystackRefundResponse>(
        "/refund",
        {
            method: "POST",
            body: JSON.stringify(body),
        },
    );
}

export async function fetchPaystackRefund(
    refundId: string | number,
): Promise<PaystackRefundStatusResponse> {
    const normalizedId = String(refundId).trim();

    if (!normalizedId || !/^\d+$/.test(normalizedId)) {
        throw new Error("A valid Paystack refund ID is required.");
    }

    return paystackRequest<PaystackRefundStatusResponse>(
        `/refund/${encodeURIComponent(normalizedId)}`,
        { method: "GET" },
    );

}

export async function listPaystackRefunds(input: {
    transactionId: string | number;
    page?: number;
    perPage?: number;
}): Promise<PaystackRefundListResponse> {
    const transactionId = String(input.transactionId).trim();

    if (!/^\d+$/.test(transactionId)) {
        throw new Error(
            "A valid Paystack transaction ID is required to reconcile refunds.",
        );
    }

    const page = input.page ?? 1;
    const perPage = input.perPage ?? 50;

    if (
        !Number.isSafeInteger(page) ||
        page < 1 ||
        !Number.isSafeInteger(perPage) ||
        perPage < 1 ||
        perPage > 100
    ) {
        throw new Error(
            "Invalid Paystack refund pagination parameters.",
        );
    }

    const query = new URLSearchParams({
        transaction: transactionId,
        page: String(page),
        perPage: String(perPage),
    });

    return paystackRequest<PaystackRefundListResponse>(
        `/refund?${query.toString()}`,
        { method: "GET" },
    );
}