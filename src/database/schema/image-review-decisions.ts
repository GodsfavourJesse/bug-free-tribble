import {
    index,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uuid,
} from "drizzle-orm/pg-core";
import { listingImages } from "./listings/listing-images.ts";
import { listings } from "./listings/listings.ts";
import { users } from "./users/users.ts";


export const imageReviewDecisionEnum = pgEnum(
    "image_review_decision",
    [
        "APPROVED",
        "REJECTED",
        "NEEDS_REVIEW",
    ],
);

export const imageReviewDecisions = pgTable(
    "image_review_decisions",
    {
        id: uuid("id")
            .defaultRandom()
            .primaryKey(),

        listingImageId: uuid("listing_image_id")
            .notNull()
            .references(
                () => listingImages.id,
                {
                    onDelete: "cascade",
                },
            ),

        listingId: uuid("listing_id")
            .notNull()
            .references(
                () => listings.id,
                {
                    onDelete: "cascade",
                },
            ),

        reviewerId: uuid("reviewer_id")
            .references(
                () => users.id,
                {
                    onDelete: "set null",
                },
            ),

        decision: imageReviewDecisionEnum(
            "decision",
        ).notNull(),

        reason: text("reason"),

        notes: text("notes"),

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
        imageIdx: index(
            "image_review_decisions_image_idx",
        ).on(
            table.listingImageId,
            table.createdAt,
        ),

        listingIdx: index(
            "image_review_decisions_listing_idx",
        ).on(
            table.listingId,
            table.createdAt,
        ),

        reviewerIdx: index(
            "image_review_decisions_reviewer_idx",
        ).on(
            table.reviewerId,
            table.createdAt,
        ),
    }),
);