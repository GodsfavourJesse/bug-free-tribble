import {
    check,
    index,
    integer,
    numeric,
    pgEnum,
    pgTable,
    timestamp,
    uniqueIndex,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";

import {
    listings,
} from "./listings/listings.ts";

import {
    users,
} from "./users/users.ts";

export const boostStatusEnum = pgEnum(
    "boost_status",
    [
        "PENDING",
        "AWAITING_APPROVAL",
        "ACTIVE",
        "REJECTED",
        "EXPIRED",
        "CANCELLED",
    ],
);

export const boostPlans = pgTable(
    "boost_plans",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        durationDays: integer(
            "duration_days",
        ).notNull(),

        price: numeric(
            "price",
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

        active: integer(
            "active",
        )
            .notNull()
            .default(1),

        createdAt: timestamp(
            "created_at",
            {
                withTimezone: true,
            },
        )
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        activeDurationIdx: index(
            "boost_plans_active_duration_idx",
        ).on(
            table.active,
            table.durationDays,
        ),

        durationPositiveCheck: check(
            "boost_plans_duration_positive",
            sql`${table.durationDays} > 0`,
        ),

        priceNonNegativeCheck: check(
            "boost_plans_price_non_negative",
            sql`${table.price} >= 0`,
        ),

        activeValueCheck: check(
            "boost_plans_active_valid",
            sql`${table.active} IN (0, 1)`,
        ),
    }),
);

export const listingBoosts = pgTable(
    "listing_boosts",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        listingId: uuid(
            "listing_id",
        )
            .notNull()
            .references(
                () => listings.id,
                {
                    onDelete: "cascade",
                },
            ),

        boostPlanId: uuid(
            "boost_plan_id",
        )
            .notNull()
            .references(
                () => boostPlans.id,
                {
                    onDelete: "restrict",
                },
            ),

        status: boostStatusEnum(
            "status",
        )
            .notNull()
            .default("PENDING"),

        /*
         * Set when payment has been independently verified.
         * This does not mean the boost is active.
         */
        paymentVerifiedAt: timestamp(
            "payment_verified_at",
            {
                withTimezone: true,
            },
        ),

        /*
         * Populated only when an administrator reviews
         * the boost request.
         */
        reviewedBy: uuid(
            "reviewed_by",
        ).references(
            () => users.id,
            {
                onDelete: "set null",
            },
        ),

        reviewedAt: timestamp(
            "reviewed_at",
            {
                withTimezone: true,
            },
        ),

        reviewNote: varchar(
            "review_note",
            {
                length: 2000,
            },
        ),

        /*
         * These timestamps remain null until approval.
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

        createdAt: timestamp(
            "created_at",
            {
                withTimezone: true,
            },
        )
            .notNull()
            .defaultNow(),
    },
    (table) => ({
        listingStatusIdx: index(
            "listing_boosts_listing_status_idx",
        ).on(
            table.listingId,
            table.status,
        ),

        activeExpiresIdx: index(
            "listing_boosts_active_expires_idx",
        ).on(
            table.status,
            table.expiresAt,
        ),

        approvalQueueIdx: index(
            "listing_boosts_approval_queue_idx",
        ).on(
            table.status,
            table.paymentVerifiedAt,
        ),

        reviewedByIdx: index(
            "listing_boosts_reviewed_by_idx",
        ).on(
            table.reviewedBy,
        ),

        /*
         * Only one active boost per listing.
         */
        oneActivePerListingIdx: uniqueIndex(
            "listing_boosts_one_active_idx",
        )
            .on(table.listingId)
            .where(
                sql`${table.status} = 'ACTIVE'`,
            ),

        /*
         * Only one unpaid boost request per listing.
         */
        onePendingPerListingIdx: uniqueIndex(
            "listing_boosts_one_pending_idx",
        )
            .on(table.listingId)
            .where(
                sql`${table.status} = 'PENDING'`,
            ),

        /*
         * A paid boost waiting for review also reserves
         * the listing against another boost request.
         */
        oneAwaitingApprovalPerListingIdx: uniqueIndex(
            "listing_boosts_one_awaiting_approval_idx",
        )
            .on(table.listingId)
            .where(
                sql`${table.status} = 'AWAITING_APPROVAL'`,
            ),

        expiresAfterStartCheck: check(
            "listing_boosts_expiry_after_start",
            sql`
                ${table.startsAt} IS NULL
                OR ${table.expiresAt} IS NULL
                OR ${table.expiresAt} > ${table.startsAt}
            `,
        ),

        /*
         * An active boost must have a complete,
         * valid activation window.
         */
        activeRequiresWindowCheck: check(
            "listing_boosts_active_requires_window",
            sql`
                ${table.status} <> 'ACTIVE'
                OR (
                    ${table.startsAt} IS NOT NULL
                    AND ${table.expiresAt} IS NOT NULL
                    AND ${table.expiresAt} > ${table.startsAt}
                )
            `,
        ),
    }),
);