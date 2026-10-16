CREATE TYPE "public"."support_ticket_status" AS ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "subject" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "requester_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "assigned_to" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "status" "support_ticket_status" DEFAULT 'OPEN' NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_type_status_updated_at_idx" ON "conversations" USING btree ("type","status","updated_at");--> statement-breakpoint
CREATE INDEX "conversations_requester_created_at_idx" ON "conversations" USING btree ("requester_id","created_at");--> statement-breakpoint
CREATE INDEX "conversations_assigned_to_status_idx" ON "conversations" USING btree ("assigned_to","status");