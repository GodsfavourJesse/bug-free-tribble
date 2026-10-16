import {
    check,
    index,
    integer,
    numeric,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";

import { users } from "../users/users.ts";

import {
    subscriptionPlanVersions,
    subscriptionPlans,
} from "./subscription-plans.ts";

/*
 * ============================================================
 * SUBSCRIPTION STATUS
 * ============================================================
 */

export const subscriptionStatusEnum =
    pgEnum(
        "subscription_status",
        [
            "PENDING",
            "ACTIVE",
            "EXPIRED",
            "CANCELLED",
        ],
    );

/*
 * ============================================================
 * SUBSCRIPTIONS
 * ============================================================
 *
 * This table represents the CURRENT subscription state.
 *
 * Historical lifecycle events belong in subscription_history.
 *
 * Price/configuration snapshots are stored here so historical
 * subscriptions remain financially accurate even when a plan
 * changes later.
 */

export const subscriptions =
    pgTable(
        "subscriptions",
        {
            id: uuid("id")
                .defaultRandom()
                .primaryKey(),

            userId: uuid(
                "user_id",
            )
                .notNull()
                .references(
                    () =>
                        users.id,
                    {
                        onDelete: "cascade",
                    },
                ),

            planId: uuid(
                "plan_id",
            )
                .notNull()
                .references(
                    () =>
                        subscriptionPlans.id,
                    {
                        onDelete: "restrict",
                    },
                ),

            planVersionId: uuid(
                "plan_version_id",
            )
                .notNull()
                .references(
                    () =>
                        subscriptionPlanVersions.id,
                    {
                        onDelete: "restrict",
                    },
                ),

            status:
                subscriptionStatusEnum(
                    "status",
                )
                    .notNull()
                    .default("PENDING"),

            /*
             * ====================================================
             * PRICE SNAPSHOT
             * ====================================================
             */

            originalPrice: numeric(
                "original_price",
                {
                    precision: 14,
                    scale: 2,
                },
            ).notNull(),

            dealerDiscountPercent:
                numeric(
                    "dealer_discount_percent",
                    {
                        precision: 5,
                        scale: 2,
                    },
                )
                    .notNull()
                    .default("0.00"),

            effectivePrice: numeric(
                "effective_price",
                {
                    precision: 14,
                    scale: 2,
                },
            ).notNull(),

            currency: varchar(
                "currency",
                {
                    length: 10,
                },
            )
                .notNull()
                .default("NGN"),

            durationDays: integer(
                "duration_days",
            ).notNull(),

            listingCredits: integer(
                "listing_credits",
            ).notNull(),

            /*
             * ====================================================
             * LIFECYCLE
             * ====================================================
             */

            startsAt: timestamp(
                "starts_at",
                {
                    withTimezone: true,
                },
            ),

            expiresAt: timestamp(
                "expires_at",
                {
                    withTimezone: true,
                },
            ),

            cancelledAt: timestamp(
                "cancelled_at",
                {
                    withTimezone: true,
                },
            ),

            cancellationReason: text(
                "cancellation_reason",
            ),

            /*
             * Renewal chain.
             */

            previousSubscriptionId:
                uuid(
                    "previous_subscription_id",
                ),

            createdAt: timestamp(
                "created_at",
                {
                    withTimezone: true,
                },
            )
                .notNull()
                .defaultNow(),

            updatedAt: timestamp(
                "updated_at",
                {
                    withTimezone: true,
                },
            )
                .notNull()
                .defaultNow(),
        },
        (table) => ({
            userStatusIdx: index(
                "subscriptions_user_status_idx",
            ).on(
                table.userId,
                table.status,
            ),

            expiresIdx: index(
                "subscriptions_expires_idx",
            ).on(
                table.status,
                table.expiresAt,
            ),

            planVersionIdx: index(
                "subscriptions_plan_version_idx",
            ).on(
                table.planVersionId,
            ),

            previousSubscriptionIdx:
                index(
                    "subscriptions_previous_subscription_idx",
                ).on(
                    table.previousSubscriptionId,
                ),

            /*
             * Only one ACTIVE subscription per user.
             */

            oneActivePerUserIdx:
                uniqueIndex(
                    "subscriptions_one_active_per_user_idx",
                )
                    .on(
                        table.userId,
                    )
                    .where(
                        sql`${table.status} = 'ACTIVE'`,
                    ),

            /*
             * Only one pending subscription per user.
             */

            onePendingPerUserIdx:
                uniqueIndex(
                    "subscriptions_one_pending_per_user_idx",
                )
                    .on(
                        table.userId,
                    )
                    .where(
                        sql`${table.status} = 'PENDING'`,
                    ),

            originalPriceNonNegativeCheck:
                check(
                    "subscriptions_original_price_non_negative",
                    sql`${table.originalPrice} >= 0`,
                ),

            effectivePriceNonNegativeCheck:
                check(
                    "subscriptions_effective_price_non_negative",
                    sql`${table.effectivePrice} >= 0`,
                ),

            discountValidCheck:
                check(
                    "subscriptions_discount_valid",
                    sql`
                        ${table.dealerDiscountPercent} >= 0
                        AND
                        ${table.dealerDiscountPercent} <= 100
                    `,
                ),

            durationPositiveCheck:
                check(
                    "subscriptions_duration_positive",
                    sql`${table.durationDays} > 0`,
                ),

            listingCreditsPositiveCheck:
                check(
                    "subscriptions_listing_credits_positive",
                    sql`${table.listingCredits} > 0`,
                ),

            expiresAfterStartCheck:
                check(
                    "subscriptions_expiry_after_start",
                    sql`
                        ${table.startsAt} IS NULL
                        OR
                        ${table.expiresAt} IS NULL
                        OR
                        ${table.expiresAt} > ${table.startsAt}
                    `,
                ),

            cancellationDateCheck:
                check(
                    "subscriptions_cancellation_date_valid",
                    sql`
                        ${table.cancelledAt} IS NULL
                        OR
                        ${table.startsAt} IS NULL
                        OR
                        ${table.cancelledAt} >= ${table.startsAt}
                    `,
                ),
        }),
    );
