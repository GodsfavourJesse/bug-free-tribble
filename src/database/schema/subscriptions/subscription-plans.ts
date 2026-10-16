import {
    boolean,
    check,
    index,
    integer,
    numeric,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";

import { users } from "../users/users.ts";

/*
 * ============================================================
 * SUBSCRIPTION PLANS
 * ============================================================
 *
 * This is the logical subscription product.
 *
 * Pricing and entitlement configuration belongs to
 * subscription_plan_versions.
 */

export const subscriptionPlans =
    pgTable(
        "subscription_plans",
        {
            id: uuid("id")
                .defaultRandom()
                .primaryKey(),

            name: varchar(
                "name",
                {
                    length: 100,
                },
            )
                .notNull()
                .unique(),

            description: text(
                "description",
            ),

            active: boolean(
                "active",
            )
                .notNull()
                .default(true),

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
            activeIdx: index(
                "subscription_plans_active_idx",
            ).on(
                table.active,
            ),
        }),
    );

/*
 * ============================================================
 * SUBSCRIPTION PLAN VERSIONS
 * ============================================================
 *
 * Each version represents an immutable pricing/configuration
 * snapshot for a plan.
 *
 * Example:
 *
 * BASIC v1
 * ₦20,000
 *
 * BASIC v2
 * ₦25,000
 *
 * Existing subscriptions continue pointing to v1.
 */

export const subscriptionPlanVersions =
    pgTable(
        "subscription_plan_versions",
        {
            id: uuid("id")
                .defaultRandom()
                .primaryKey(),

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

            version: integer(
                "version",
            )
                .notNull(),

            price: numeric(
                "price",
                {
                    precision: 14,
                    scale: 2,
                },
            )
                .notNull(),

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
            )
                .notNull()
                .default(30),

            listingCredits: integer(
                "listing_credits",
            )
                .notNull(),

            dealerDiscountPercent: numeric(
                "dealer_discount_percent",
                {
                    precision: 5,
                    scale: 2,
                },
            )
                .notNull()
                .default("30.00"),

            active: boolean(
                "active",
            )
                .notNull()
                .default(true),

            createdAt: timestamp(
                "created_at",
                {
                    withTimezone: true,
                },
            )
                .notNull()
                .defaultNow(),

            createdBy: uuid(
                "created_by",
            ).references(
                () =>
                    users.id,
                {
                    onDelete: "set null",
                },
            ),
        },
        (table) => ({
            planVersionUniqueIdx:
                uniqueIndex(
                    "subscription_plan_versions_plan_version_unique_idx",
                ).on(
                    table.planId,
                    table.version,
                ),

            planIdx: index(
                "subscription_plan_versions_plan_idx",
            ).on(
                table.planId,
            ),

            activeIdx: index(
                "subscription_plan_versions_active_idx",
            ).on(
                table.active,
            ),

            priceNonNegativeCheck:
                check(
                    "subscription_plan_versions_price_non_negative",
                    sql`${table.price} >= 0`,
                ),

            durationPositiveCheck:
                check(
                    "subscription_plan_versions_duration_positive",
                    sql`${table.durationDays} > 0`,
                ),

            listingCreditsPositiveCheck:
                check(
                    "subscription_plan_versions_listing_credits_positive",
                    sql`${table.listingCredits} > 0`,
                ),

            dealerDiscountValidCheck:
                check(
                    "subscription_plan_versions_discount_valid",
                    sql`
                        ${table.dealerDiscountPercent} >= 0
                        AND
                        ${table.dealerDiscountPercent} <= 100
                    `,
                ),

            versionPositiveCheck:
                check(
                    "subscription_plan_versions_version_positive",
                    sql`${table.version} > 0`,
                ),
        }),
    );