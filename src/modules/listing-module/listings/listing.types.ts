export type ListingStatus =
    | "DRAFT"
    | "PENDING_REVIEW"
    | "APPROVED"
    | "REJECTED"
    | "EXPIRED"
    | "SOLD"
    | "SUSPENDED"
    | "DELETED";

export type ListingLifecycleAction =
    | "UPDATE_DETAILS"
    | "SUBMIT_FOR_REVIEW"
    | "APPROVE"
    | "REJECT"
    | "EXPIRE"
    | "MARK_SOLD"
    | "SUSPEND"
    | "RESTORE"
    | "REACTIVATE"
    | "DELETE";

export type ListingHistoryAction =
    | "CREATED"
    | "UPDATED"
    | "SUBMIT_FOR_REVIEW"
    | "APPROVED"
    | "REJECTED"
    | "EXPIRED"
    | "MARKED_SOLD"
    | "SUSPENDED"
    | "RESTORED"
    | "REACTIVATED"
    | "DELETED";

export const allowedTransitions: Record<
    ListingStatus,
    Partial<
        Record<
            ListingLifecycleAction,
            ListingStatus
        >
    >
> = {
    DRAFT: {
        UPDATE_DETAILS: "DRAFT",
        SUBMIT_FOR_REVIEW: "PENDING_REVIEW",
        DELETE: "DELETED",
    },

    PENDING_REVIEW: {
        UPDATE_DETAILS: "PENDING_REVIEW",
        APPROVE: "APPROVED",
        REJECT: "REJECTED",
        DELETE: "DELETED",
    },

    APPROVED: {
        UPDATE_DETAILS: "PENDING_REVIEW",
        EXPIRE: "EXPIRED",
        MARK_SOLD: "SOLD",
        SUSPEND: "SUSPENDED",
        DELETE: "DELETED",
    },

    REJECTED: {
        UPDATE_DETAILS: "PENDING_REVIEW",
        SUBMIT_FOR_REVIEW: "PENDING_REVIEW",
        DELETE: "DELETED",
    },

    EXPIRED: {
        REACTIVATE: "PENDING_REVIEW",
        DELETE: "DELETED",
    },

    SOLD: {
        REACTIVATE: "PENDING_REVIEW",
        DELETE: "DELETED",
    },

    SUSPENDED: {
        REACTIVATE: "PENDING_REVIEW",
        DELETE: "DELETED",
    },

    DELETED: {
        RESTORE: "DRAFT",
    },
};

export const historyActionMap: Record<
    ListingLifecycleAction,
    ListingHistoryAction
> = {
    UPDATE_DETAILS: "UPDATED",

    SUBMIT_FOR_REVIEW: "SUBMIT_FOR_REVIEW",

    APPROVE: "APPROVED",

    REJECT: "REJECTED",

    EXPIRE: "EXPIRED",

    MARK_SOLD: "MARKED_SOLD",

    SUSPEND: "SUSPENDED",

    RESTORE: "RESTORED",

    REACTIVATE: "REACTIVATED",

    DELETE: "DELETED",
};

export type SellerListingStatus = ListingStatus;

export interface SellerListingsOptions {
    sellerId: string;
    status?: SellerListingStatus;
    page?: number;
    limit?: number;
}

export const sellerListingStatuses = [
    "DRAFT",
    "PENDING_REVIEW",
    "APPROVED",
    "REJECTED",
    "EXPIRED",
    "SOLD",
    "SUSPENDED",
    "DELETED",
] as const;

export function isSellerListingStatus(
    value: string,
): value is SellerListingStatus {
    return sellerListingStatuses.some(
        (status) => status === value,
    );
}

export interface GetListingViewer {
    userId?: string;
    visitorId?: string;
}