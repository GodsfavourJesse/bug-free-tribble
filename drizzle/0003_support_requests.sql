CREATE TABLE IF NOT EXISTS "support_requests" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid,
    "name" text NOT NULL,
    "email" text NOT NULL,
    "subject" text NOT NULL,
    "access_token_hash" text NOT NULL UNIQUE,
    "status" text DEFAULT 'OPEN' NOT NULL,
    "messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT "support_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "support_requests_status_updated_at_idx" ON "support_requests" ("status", "updated_at");
CREATE INDEX IF NOT EXISTS "support_requests_user_created_at_idx" ON "support_requests" ("user_id", "created_at");
