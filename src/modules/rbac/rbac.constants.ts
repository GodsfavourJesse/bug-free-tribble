export const RBAC_ROLES = [
    "SUPER_ADMIN",
    "ADMIN",
    "SUPPORT",
    "CUSTOMER",
] as const;

export type RbacRole =
    (typeof RBAC_ROLES)[number];

export const PERMISSIONS = [
    "dashboard:view",
    "user:role:manage",
    "user:view",
    "user:suspend",
    "user:delete",

    "dealer:view",
    "dealer:review",

    "listing:view",
    "listing:review",
    "listing:suspend",
    "listing:delete",

    "payment:view",
    "payment:refund",
    "payment:refund:execute",
    "payment:reconcile",

    "subscription:view",
    "subscription:manage",

    "boost:view",
    "boost:manage",

    "message:view",
    "message:moderate",

    // Support-ticket management.
    "support:ticket:view",
    "support:ticket:view_all",
    "support:ticket:assign",
    "support:ticket:manage",
    "support:ticket:notes",

    "notification:manage",

    "audit:view",

    "settings:view",
    "settings:manage",

    // Listing-credit administration.
    "credits:adjust",
] as const;

export type Permission =
    (typeof PERMISSIONS)[number];

export const PERMISSION_DESCRIPTIONS: Record<
    Permission,
    string
> = {
    "dashboard:view":
        "View administrative dashboard KPIs and system health.",

    "user:role:manage":
        "Assign and remove administrative roles.",
    "user:view":
        "View user accounts.",

    "user:suspend":
        "Suspend user accounts.",

    "user:delete":
        "Delete or administratively remove user accounts.",

    "dealer:view":
        "View dealer accounts and applications.",

    "dealer:review":
        "Review and approve or reject dealer applications.",

    "listing:view":
        "View marketplace listings in administrative context.",

    "listing:review":
        "Review pending marketplace listings.",

    "listing:suspend":
        "Suspend marketplace listings.",

    "listing:delete":
        "Delete marketplace listings.",

    "payment:view":
        "View payment records.",

    "payment:refund":
        "Issue or approve payment refunds.",

    "payment:refund:execute":
        "Execute or reconcile an approved refund through the payment provider.",

    "payment:reconcile":
        "View and safely re-queue payment reconciliation jobs.",

    "subscription:view":
        "View subscription records.",

    "subscription:manage":
        "Create, modify, activate, cancel or otherwise manage subscriptions.",

    "boost:view":
        "View boost requests and boost records.",

    "boost:manage":
        "Approve, reject or otherwise manage listing boosts.",

    "message:view":
        "View messages when permitted by moderation/support policy.",

    "message:moderate":
        "Moderate marketplace messages.",

    "support:ticket:view":
        "View support tickets permitted by the ticket-access policy.",

    "support:ticket:view_all":
        "View all support tickets across the platform.",

    "support:ticket:assign":
        "Assign support tickets to authorized support agents.",

    "support:ticket:manage":
        "Manage support tickets, including permitted status changes and resolution.",

    "support:ticket:notes":
        "Read and create private internal notes on support tickets.",

    "notification:manage":
        "Manage administrative notification operations.",

    "audit:view":
        "View audit and security activity.",

    "settings:view":
        "View platform settings.",

    "settings:manage":
        "Manage platform settings.",

    "credits:adjust":
        "Manually adjust a user's listing-credit balance with a mandatory reason and an audit record.",
};

export const ROLE_PERMISSIONS: Record<
    RbacRole,
    readonly Permission[]
> = {
    SUPER_ADMIN: [
        ...PERMISSIONS,
    ],

    ADMIN: [
        "dashboard:view",
        "user:view",
        "user:suspend",
        "user:delete",

        "dealer:view",
        "dealer:review",

        "listing:view",
        "listing:review",
        "listing:suspend",
        "listing:delete",

        "payment:view",
        "payment:refund",
        "payment:refund:execute",
        "payment:reconcile",

        "subscription:view",
        "subscription:manage",

        "boost:view",
        "boost:manage",

        "message:view",
        "message:moderate",

        "support:ticket:view",
        "support:ticket:view_all",
        "support:ticket:assign",
        "support:ticket:manage",

        "notification:manage",

        "audit:view",

        "settings:view",
        "settings:manage",

        "credits:adjust",
    ],

    SUPPORT: [
        "support:ticket:view_all",
        "support:ticket:notes",
        "user:view",

        "dealer:view",

        "listing:view",

        "payment:view",

        "subscription:view",

        "boost:view",

        "message:view",
        "message:moderate",

        "support:ticket:view",
        "support:ticket:assign",
        "support:ticket:manage",
    ],

    CUSTOMER: [],
};