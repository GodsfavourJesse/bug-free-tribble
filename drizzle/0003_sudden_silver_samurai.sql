CREATE TYPE "public"."notification_channel" AS ENUM('IN_APP', 'SOCKET', 'EMAIL', 'PUSH');--> statement-breakpoint
CREATE TYPE "public"."notification_delivery_status" AS ENUM('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TABLE "notification_delivery_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" "notification_channel" NOT NULL,
	"idempotency_key" varchar(255) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "notification_delivery_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"worker_id" varchar(150),
	"processed_at" timestamp with time zone,
	"last_error" varchar(2000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_delivery_jobs" ADD CONSTRAINT "notification_delivery_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_delivery_jobs_idempotency_idx" ON "notification_delivery_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "notification_delivery_jobs_pending_idx" ON "notification_delivery_jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "notification_delivery_jobs_user_channel_idx" ON "notification_delivery_jobs" USING btree ("user_id","channel");--> statement-breakpoint
CREATE INDEX "notification_delivery_jobs_processing_idx" ON "notification_delivery_jobs" USING btree ("status","locked_at");