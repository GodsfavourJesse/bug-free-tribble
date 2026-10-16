import {
    check,
    index,
    jsonb,
    numeric,
    pgEnum,
    pgTable,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";

import { users } from "../users/users.ts";
import { subscriptions } from "../subscriptions/subscriptions.ts";
import { listingBoosts } from "../boosts.ts";

export const paymentPurposeEnum =
    pgEnum(
        "payment_purpose",
        [
            "SUBSCRIPTION",
            "BOOST",
        ],
    );

export const paymentStatusEnum =
    pgEnum(
        "payment_status",
        [
            "PENDING",
            "SUCCESS",
            "FAILED",
            "ABANDONED",
            "REVERSED",
            "PROCESSING",
        ],
    );

export const payments = pgTable(
    "payments",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        userId: uuid("user_id")
            .notNull()
            .references(
                () => users.id,
                {
                    onDelete: "cascade",
                },
            ),

        purpose:
            paymentPurposeEnum(
                "purpose",
            ).notNull(),

        status:
            paymentStatusEnum(
                "status",
            )
                .notNull()
                .default("PENDING"),

        reference: varchar(
            "reference",
            {
                length: 100,
            },
        )
            .notNull()
            .unique(),

        provider: varchar(
            "provider",
            {
                length: 50,
            },
        )
            .notNull()
            .default("PAYSTACK"),

        gatewayTransactionId:
            varchar(
                "gateway_transaction_id",
                {
                    length: 100,
                },
            ),

        amount: numeric(
            "amount",
            {
                precision: 14,
                scale: 2,
            },
        ).notNull(),

        originalAmount: numeric(
            "original_amount",
            {
                precision: 14,
                scale: 2,
            },
        )
            .notNull()
            .default("0"),

        discountPercent: numeric(
            "discount_percent",
            {
                precision: 5,
                scale: 2,
            },
        )
            .notNull()
            .default("0"),

        discountAmount: numeric(
            "discount_amount",
            {
                precision: 14,
                scale: 2,
            },
        )
            .notNull()
            .default("0"),

        currency: varchar(
            "currency",
            {
                length: 10,
            },
        ).notNull(),

        subscriptionId: uuid(
            "subscription_id",
        ).references(
            () => subscriptions.id,
            {
                onDelete: "set null",
            },
        ),

        listingBoostId: uuid(
            "listing_boost_id",
        ).references(
            () => listingBoosts.id,
            {
                onDelete: "set null",
            },
        ),

        providerData: jsonb(
            "provider_data",
        ),

        initializationToken: uuid(
            "initialization_token",
        ),

        initializationExpiresAt: timestamp(
            "initialization_expires_at",
            {
                withTimezone: true,
            },
        ),

        paidAt: timestamp(
            "paid_at",
            {
                withTimezone: true,
            },
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
        gatewayTransactionUniqueIdx:
            uniqueIndex(
                "payments_gateway_transaction_id_unique_idx",
            )
                .on(
                    table.gatewayTransactionId,
                )
                .where(
                    sql`
                        ${table.gatewayTransactionId}
                        IS NOT NULL
                    `,
                ),

        pendingSubscriptionPaymentUniqueIdx:
            uniqueIndex(
                "payments_pending_subscription_unique_idx",
            )
            .on(
                table.subscriptionId,
            )
            .where(
                sql`
                    ${table.purpose} = 'SUBSCRIPTION'
                    AND
                    ${table.status} = 'PENDING'
                    AND
                    ${table.subscriptionId} IS NOT NULL
                `,
            ),
            
        pendingBoostPaymentUniqueIdx:
            uniqueIndex(
                "payments_pending_boost_unique_idx",
            )
                .on(
                    table.listingBoostId,
                )
                .where(
                    sql`
                        ${table.purpose} = 'BOOST'
                        AND
                        ${table.status} = 'PENDING'
                        AND
                        ${table.listingBoostId} IS NOT NULL
                    `,
                ),

        

        userCreatedIdx: index(
            "payments_user_created_idx",
        ).on(
            table.userId,
            table.createdAt,
        ),

        statusCreatedIdx: index(
            "payments_status_created_idx",
        ).on(
            table.status,
            table.createdAt,
        ),

        subscriptionIdx: index(
            "payments_subscription_idx",
        ).on(
            table.subscriptionId,
        ),

        listingBoostIdx: index(
            "payments_listing_boost_idx",
        ).on(
            table.listingBoostId,
        ),

        amountNonNegativeCheck: check(
            "payments_amount_non_negative",
            sql`${table.amount} >= 0`,
        ),

        originalAmountNonNegativeCheck:
            check(
                "payments_original_amount_non_negative",
                sql`${table.originalAmount} >= 0`,
            ),

        discountPercentValidCheck:
            check(
                "payments_discount_percent_valid",
                sql`
                    ${table.discountPercent} >= 0
                    AND
                    ${table.discountPercent} <= 100
                `,
            ),

        discountAmountNonNegativeCheck:
            check(
                "payments_discount_amount_non_negative",
                sql`${table.discountAmount} >= 0`,
            ),

        /*
         * Every payment must point to exactly one
         * business target.
         *
         * SUBSCRIPTION -> subscriptionId only
         * BOOST        -> listingBoostId only
         */
        purposeTargetCheck: check(
            "payments_purpose_target_check",
            sql`
                (
                    ${table.purpose} = 'SUBSCRIPTION'
                    AND
                    ${table.subscriptionId} IS NOT NULL
                    AND
                    ${table.listingBoostId} IS NULL
                )
                OR
                (
                    ${table.purpose} = 'BOOST'
                    AND
                    ${table.subscriptionId} IS NULL
                    AND
                    ${table.listingBoostId} IS NOT NULL
                )
            `,

        ),
    }),
);