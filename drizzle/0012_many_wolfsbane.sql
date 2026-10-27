CREATE TYPE "public"."image_check_source" AS ENUM('AUTOMATED', 'ADMIN');--> statement-breakpoint
ALTER TABLE "listing_images" ADD COLUMN "image_check_source" "image_check_source";