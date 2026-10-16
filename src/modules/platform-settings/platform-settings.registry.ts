export const SETTING_DEFINITIONS = {
    dealer_discount_percent: {
        key: "dealer_discount_percent",
        label: "Dealer Subscription Discount",
        description:
        "Percentage discount applied to eligible dealer subscriptions. Does not apply to listing boosts.",
        category: "COMMERCIAL",
        type: "INTEGER",
        defaultValue: 30,
        min: 0,
        max: 100,
        unit: "percent",
        editable: true,
        effect: "IMMEDIATE",
    },

    free_listing_credits: {
        key: "free_listing_credits",
        label: "Free Listing Credits",
        description:
            "Default free listing allowance granted to eligible new users.",
        category: "LISTINGS",
        type: "INTEGER",
        defaultValue: 3,
        min: 0,
        max: 1000,
        unit: "credits",
        editable: true,
        effect: "NEW_REGISTRATIONS",
    },

    listing_duration_days: {
        key: "listing_duration_days",
        label: "Listing Visibility Duration",
        description:
            "Number of days an approved listing remains visible before expiration.",
        category: "LISTINGS",
        type: "INTEGER",
        defaultValue: 30,
        min: 1,
        max: 365,
        unit: "days",
        editable: true,
        effect: "NEW_APPROVALS",
    },

} as const;

export type SettingKey =
keyof typeof SETTING_DEFINITIONS;

export type SettingDefinition =
(typeof SETTING_DEFINITIONS)[SettingKey];

export const SETTING_KEYS = {
    dealerDiscountPercent:
    "dealer_discount_percent",

    freeListingCredits:
        "free_listing_credits",

    listingDurationDays:
        "listing_duration_days",
} as const satisfies Record<string, SettingKey>;

export const DEFAULT_SETTINGS = {
    dealer_discount_percent:
    SETTING_DEFINITIONS.dealer_discount_percent.defaultValue,

    free_listing_credits:
        SETTING_DEFINITIONS.free_listing_credits.defaultValue,

    listing_duration_days:
        SETTING_DEFINITIONS.listing_duration_days.defaultValue,

} satisfies Record<SettingKey, number>;

export function isSettingKey(
    key: string,
): key is SettingKey {
    return Object.prototype.hasOwnProperty.call(
        SETTING_DEFINITIONS,
        key,
    );
}

export function getSettingDefinition(
    key: string,
): SettingDefinition | undefined {
    if (!isSettingKey(key)) {
        return undefined;
    }

    return SETTING_DEFINITIONS[key];
}
