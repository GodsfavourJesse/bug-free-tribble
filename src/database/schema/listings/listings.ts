import {
    check,
    index,
    integer,
    jsonb,
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

import {
    vehicleVariants,
} from "../vehicles/vehicle-variants.ts";


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


/**
 * Vehicle condition categories used throughout KARMASS.
 *
 * BRAND_NEW:
 * Vehicle has never been used.
 *
 * FOREIGN_USED:
 * Previously owned or used outside Nigeria.
 *
 * NIGERIAN_USED:
 * Previously owned or used within Nigeria.
 *
 * Legacy database values are migrated separately:
 * NEW  -> BRAND_NEW
 * USED -> NIGERIAN_USED
 */
export const listingConditionEnum =
    pgEnum(
        "listing_condition",
        [
            "BRAND_NEW",
            "FOREIGN_USED",
            "NIGERIAN_USED",
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

        /**
         * Optional catalogue link. Manual listings do not need a
         * matching vehicle variant in the catalogue.
         */
        vehicleVariantId: uuid(
            "vehicle_variant_id",
        )
            .references(
                () => vehicleVariants.id,
                {
                    onDelete: "restrict",
                },
            ),

        /**
         * Seller-facing vehicle identity snapshot. These fields are
         * intentionally independent of the catalogue so a seller can
         * list vehicles that are missing or incorrectly represented there.
         * They remain nullable at the database level for compatibility
         * with existing catalogue-linked rows during migration; creation
         * validation enforces a complete identity for new listings.
         */
        makeName: varchar("make_name", { length: 100 }),

        modelName: varchar("model_name", { length: 120 }),

        year: integer("year"),

        generationName: varchar("generation_name", { length: 120 }),

        variantName: varchar("variant_name", { length: 160 }),

        /** Seller-editable specification snapshot. */
        bodyStyle: varchar("body_style", { length: 60 }),

        fuelType: varchar("fuel_type", { length: 60 }),

        transmission: varchar("transmission", { length: 60 }),

        driveType: varchar("drive_type", { length: 60 }),

        engineCapacity: varchar("engine_capacity", { length: 60 }),

        horsepower: integer("horsepower"),

        exteriorColor: varchar("exterior_color", { length: 80 }),

        interiorColor: varchar("interior_color", { length: 80 }),

        seats: integer("seats"),

        doors: integer("doors"),

        /** Additional seller-defined key/value specifications. */
        specifications: jsonb("specifications")
            .$type<Record<string, string | number | boolean | null>>()
            .notNull()
            .default({}),

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
                .default("NIGERIAN_USED"),

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
            "view_count",
        )
            .notNull()
            .default(0),

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

        makeModelYearIdx: index(
            "listings_make_model_year_idx",
        ).on(
            table.makeName,
            table.modelName,
            table.year,
        ),

        yearIdx: index(
            "listings_year_idx",
        ).on(
            table.year,
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

        yearValidCheck: check(
            "listings_year_valid",
            sql`
                ${table.year} IS NULL
                OR (${table.year} >= 1886 AND ${table.year} <= 2100)
            `,
        ),

        horsepowerNonNegativeCheck: check(
            "listings_horsepower_non_negative",
            sql`${table.horsepower} IS NULL OR ${table.horsepower} >= 0`,
        ),

        seatsPositiveCheck: check(
            "listings_seats_positive",
            sql`${table.seats} IS NULL OR ${table.seats} > 0`,
        ),

        doorsPositiveCheck: check(
            "listings_doors_positive",
            sql`${table.doors} IS NULL OR ${table.doors} > 0`,
        ),

        vehicleIdentityCheck: check(
            "listings_vehicle_identity_valid",
            sql`
                ${table.vehicleVariantId} IS NOT NULL
                OR (
                    NULLIF(BTRIM(${table.makeName}), '') IS NOT NULL
                    AND NULLIF(BTRIM(${table.modelName}), '') IS NOT NULL
                    AND ${table.year} IS NOT NULL
                )
            `,
        ),
    }),
);