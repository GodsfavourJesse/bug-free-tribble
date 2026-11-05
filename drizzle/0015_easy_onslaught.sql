ALTER TABLE "listings" ALTER COLUMN "condition" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "listings" ALTER COLUMN "condition" SET DEFAULT 'NIGERIAN_USED'::text;--> statement-breakpoint
DROP TYPE "public"."listing_condition";--> statement-breakpoint
CREATE TYPE "public"."listing_condition" AS ENUM('BRAND_NEW', 'FOREIGN_USED', 'NIGERIAN_USED');--> statement-breakpoint
ALTER TABLE "listings" ALTER COLUMN "condition" SET DEFAULT 'NIGERIAN_USED'::"public"."listing_condition";--> statement-breakpoint
ALTER TABLE "listings" ALTER COLUMN "condition" SET DATA TYPE "public"."listing_condition" USING "condition"::"public"."listing_condition";