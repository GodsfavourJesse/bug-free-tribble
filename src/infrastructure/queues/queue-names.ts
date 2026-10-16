export const QUEUE_NAMES = {
    NOTIFICATIONS: "notifications",
    LISTING_LIFECYCLE: "listing-lifecycle",
    SUBSCRIPTION_LIFECYCLE: "subscription-lifecycle",
    PAYMENTS: "payments",
    IMAGE_INTELLIGENCE: "image-intelligence",
    EMAIL: "email",
} as const;

export type QueueName =
    (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];