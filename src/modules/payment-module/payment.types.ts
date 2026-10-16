export type PaystackTransactionDataLike = {
    id: number;
    status: string;
    reference: string;
    amount: number;
    currency: string;
    paid_at?: string | null;
    metadata?: unknown;
};

export type PaymentProviderData =
    | {
          authorization_url?: string;
          access_code?: string;
          reference?: string;
      }
    | null;

export type SubscriptionPaymentResult = {
    paymentId: string;
    subscriptionId: string;
    reference: string;
    authorizationUrl?: string;
    accessCode?: string;
    amount: number;
    currency: string;
    dealerDiscountPercent: number;
};

export type BoostPaymentResult = {
    paymentId: string;
    reference: string;
    authorizationUrl?: string;
    accessCode?: string;
    amount: number;
    currency: string;
};

export type FulfilledPaymentResult = {
    payment: unknown;
    subscription: unknown;
};