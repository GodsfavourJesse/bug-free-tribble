ALTER TABLE "user_privacy_settings" ALTER COLUMN "show_phone" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "whatsapp_phone" varchar(30);--> statement-breakpoint
ALTER TABLE "user_privacy_settings" ADD COLUMN "show_whatsapp" boolean DEFAULT true NOT NULL;