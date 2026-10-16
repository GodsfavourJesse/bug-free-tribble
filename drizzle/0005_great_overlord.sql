CREATE TYPE "public"."dealer_document_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
ALTER TABLE "dealer_documents" ADD COLUMN "status" "dealer_document_status" DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "dealer_documents" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "dealer_documents" ADD COLUMN "reviewed_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "dealer_documents" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dealer_documents" ADD CONSTRAINT "dealer_documents_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;