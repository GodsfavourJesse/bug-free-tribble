import {
    check,
    index,
    integer,
    numeric,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";

import {
    users,
} from "../users/users.ts";
import { vehicleVariants } from "../vehicles/vehicle-variants.ts";


export const listingStatusEnum =
    pgEnum(
        "listing_status",
        [
            "DRAFT",
            "PENDING_REVIEW",
            "APPROVED",
            "REJECTED",
            "EXPIRED",
            "SOLD",
            "SUSPENDED",
            "DELETED",
        ],
    );

export const listingConditionEnum =
    pgEnum(
        "listing_condition",
        [
            "NEW",
            "USED",
        ],
    );

export const listings = pgTable(
    "listings",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        sellerId: uuid("seller_id")
            .notNull()
            .references(
                () => users.id,
                {
                    onDelete: "cascade",
                },
            ),

        vehicleVariantId: uuid(
            "vehicle_variant_id",
        )
            .notNull()
            .references(
                () => vehicleVariants.id,
                {
                    onDelete: "restrict",
                },
            ),

        title: varchar(
            "title",
            {
                length: 200,
            },
        ).notNull(),

        description: text(
            "description",
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

        mileage: integer(
            "mileage",
        ),

        condition:
            listingConditionEnum(
                "condition",
            )
                .notNull()
                .default("USED"),

        country: varchar(
            "country",
            {
                length: 100,
            },
        )
            .notNull()
            .default("Nigeria"),

        state: varchar(
            "state",
            {
                length: 100,
            },
        ),

        city: varchar(
            "city",
            {
                length: 100,
            },
        ),

        status: listingStatusEnum(
            "status",
        )
            .notNull()
            .default("DRAFT"),

        viewCount: integer(
            "view_count"
        ).notNull().default(0),

        rejectionReason: text(
            "rejection_reason",
        ),

        publishedAt: timestamp(
            "published_at",
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
        sellerStatusIdx: index(
            "listings_seller_status_idx",
        ).on(
            table.sellerId,
            table.status,
        ),

        sellerCreatedIdx: index(
            "listings_seller_created_idx",
        ).on(
            table.sellerId,
            table.createdAt,
        ),

        marketplaceIdx: index(
            "listings_marketplace_idx",
        ).on(
            table.status,
            table.expiresAt,
            table.createdAt,
        ),

        vehicleVariantIdx: index(
            "listings_vehicle_variant_idx",
        ).on(
            table.vehicleVariantId,
        ),

        priceIdx: index(
            "listings_price_idx",
        ).on(
            table.price,
        ),

        stateCityIdx: index(
            "listings_state_city_idx",
        ).on(
            table.state,
            table.city,
        ),

        priceNonNegativeCheck: check(
            "listings_price_non_negative",
            sql`${table.price} >= 0`,
        ),

        mileageNonNegativeCheck: check(
            "listings_mileage_non_negative",
            sql`
                ${table.mileage} IS NULL
                OR ${table.mileage} >= 0
            `,
        ),
    }),
);