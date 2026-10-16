import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { listings } from "./listings/listings.ts";
import { users } from "./users/users.ts";

export const reviewDecisionEnum = pgEnum("review_decision", ["APPROVED", "REJECTED"]);
export const listingReviews = pgTable("listing_reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  listingId: uuid("listing_id").notNull().references(() => listings.id, { onDelete: "cascade" }),
  reviewerId: uuid("reviewer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  decision: reviewDecisionEnum("decision").notNull(),
  rejectionReason: text("rejection_reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
