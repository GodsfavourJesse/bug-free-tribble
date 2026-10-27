ALTER TABLE "dealer_profiles" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "dealer_profiles" ADD COLUMN "profile_picture_url" varchar(2048);--> statement-breakpoint
ALTER TABLE "dealer_profiles" ADD COLUMN "profile_picture_public_id" varchar(255);--> statement-breakpoint
ALTER TABLE "dealer_profiles" ADD COLUMN "cover_photo_url" varchar(2048);--> statement-breakpoint
ALTER TABLE "dealer_profiles" ADD COLUMN "cover_photo_public_id" varchar(255);