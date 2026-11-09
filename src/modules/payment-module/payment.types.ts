export type PaymentStatus =
    | "STARTED"
    | "ABANDONED"
    | "FAILED"
    | "SUCCESS";

export type GatewayPaymentStatus =
    | "success"
    | "failed"
    | "abandoned"
    | "ongoing"
    | "pending"
    | "processing"
    | "reversed"
    | string;

export type PaystackTransactionDataLike = {
    id: number;
    status: GatewayPaymentStatus;
    reference: string;
    amount: number;
    currency: string;
    paid_at?: string | null;
    metadata?: unknown;
    gateway_response?: string | null;
    channel?: string | null;
};

export type PaymentProviderData =
    | {
          authorization_url?: string;
          access_code?: string;
          reference?: string;
          [key: string]: unknown;
      }
    | null;

/**
 * Common state returned when initializing or resuming
 * an existing payment checkout.
 */
export type PaymentSessionResult = {
    paymentId: string;
    reference: string;
    status: PaymentStatus;

    /**
     * True when the payment is still STARTED and
     * its existing Paystack checkout can be resumed.
     */
    canResume: boolean;

    authorizationUrl?: string;
    accessCode?: string;

    amount: number;
    currency: string;
};

export type SubscriptionPaymentResult =
    PaymentSessionResult & {
        subscriptionId: string;
        dealerDiscountPercent: number;
    };

export type BoostPaymentResult =
    PaymentSessionResult;

export type FulfilledPaymentResult = {
    payment: unknown;
    subscription: unknown;
};