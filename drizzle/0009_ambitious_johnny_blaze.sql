CREATE TYPE "public"."image_review_decision" AS ENUM('APPROVED', 'REJECTED', 'NEEDS_REVIEW');--> statement-breakpoint
CREATE TABLE "image_review_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_image_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"decision" "image_review_decision" NOT NULL,
	"reason" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "image_review_decisions" ADD CONSTRAINT "image_review_decisions_listing_image_id_listing_images_id_fk" FOREIGN KEY ("listing_image_id") REFERENCES "public"."listing_images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_review_decisions" ADD CONSTRAINT "image_review_decisions_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_review_decisions" ADD CONSTRAINT "image_review_decisions_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "image_review_decisions_image_idx" ON "image_review_decisions" USING btree ("listing_image_id","created_at");--> statement-breakpoint
CREATE INDEX "image_review_decisions_listing_idx" ON "image_review_decisions" USING btree ("listing_id","created_at");--> statement-breakpoint
CREATE INDEX "image_review_decisions_reviewer_idx" ON "image_review_decisions" USING btree ("reviewer_id","created_at");