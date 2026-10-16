CREATE TABLE "admin_security_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"user_id" uuid,
	"current_stage" integer DEFAULT 0 NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'IN_PROGRESS' NOT NULL,
	"challenge_version" varchar(40) DEFAULT 'v1' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"ip_address" varchar(64),
	"user_agent" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_security_challenges_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "admin_security_challenges" ADD CONSTRAINT "admin_security_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_security_challenges_status_expiry_idx" ON "admin_security_challenges" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "admin_security_challenges_user_created_idx" ON "admin_security_challenges" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "admin_security_challenges_expiry_idx" ON "admin_security_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_security_challenges_token_hash_unique_idx" ON "admin_security_challenges" USING btree ("token_hash");