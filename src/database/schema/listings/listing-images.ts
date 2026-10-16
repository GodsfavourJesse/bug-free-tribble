import {
    index,
    integer,
    numeric,
    pgEnum,
    pgTable,
    text,
    timestamp,
    unique,
    uuid,
    varchar,
} from "drizzle-orm/pg-core";

import { listings } from "./listings.ts";

export const imageCheckStatusEnum = pgEnum(
    "image_check_status",
    [
        "PENDING",
        "PASSED",
        "REVIEW",
        "FAILED",
    ],
);

export const listingImages = pgTable(
    "listing_images",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        listingId: uuid("listing_id")
            .notNull()
            .references(
                () => listings.id,
                {
                    onDelete: "cascade",
                },
            ),

        objectKey: varchar(
            "object_key",
            {
                length: 500,
            },
        ).notNull(),

        originalName: varchar(
            "original_name",
            {
                length: 255,
            },
        ),

        mimeType: varchar(
            "mime_type",
            {
                length: 100,
            },
        ),

        width: integer("width"),

        height: integer("height"),

        sortOrder: integer(
            "sort_order",
        )
            .notNull()
            .default(0),

        sha256: varchar(
            "sha256",
            {
                length: 64,
            },
        ),

        perceptualHash: varchar(
            "perceptual_hash",
            {
                length: 64,
            },
        ),

        imageCheckStatus:
            imageCheckStatusEnum(
                "image_check_status",
            )
                .notNull()
                .default("PENDING"),

        similarityScore: numeric(
            "similarity_score",
            {
                precision: 5,
                scale: 2,
            },
        ),

        /*
         * These fields intentionally remain nullable.
         *
         * matchedImageId and matchedListingId are populated only
         * when image intelligence finds a potential duplicate.
         *
         * We are not adding a hard FK to matchedImageId here because
         * this table references itself and doing so directly can create
         * a schema initialization circular-reference problem.
         *
         * The matchedListingId relationship is enforced by the service
         * layer and validated during image analysis.
         */
        matchedImageId: uuid(
            "matched_image_id",
        ),

        matchedListingId: uuid(
            "matched_listing_id",
        ),

        checkReason: text(
            "check_reason",
        ),

        checkedAt: timestamp(
            "checked_at",
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
        /*
         * A listing cannot have two images with the same position.
         */
        listingSortUnique: unique(
            "listing_images_listing_sort_unique",
        ).on(
            table.listingId,
            table.sortOrder,
        ),

        listingIdx: index(
            "listing_images_listing_idx",
        ).on(
            table.listingId,
            table.sortOrder,
        ),

        sha256Idx: index(
            "listing_images_sha256_idx",
        ).on(
            table.sha256,
        ),

        perceptualHashIdx: index(
            "listing_images_perceptual_hash_idx",
        ).on(
            table.perceptualHash,
        ),

        statusIdx: index(
            "listing_images_status_idx",
        ).on(
            table.imageCheckStatus,
        ),
    }),
);