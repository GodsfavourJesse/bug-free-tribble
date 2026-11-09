ALTER TABLE "listing_credit_ledger" ADD COLUMN "credit_source" varchar(40) NOT NULL;--> statement-breakpoint
CREATE INDEX "listing_credit_ledger_source_idx" ON "listing_credit_ledger" USING btree ("user_id","credit_source");--> statement-breakpoint
ALTER TABLE "listing_credit_ledger" ADD CONSTRAINT "listing_credit_ledger_source_check" CHECK ("listing_credit_ledger"."credit_source" IN (
                'FREE_TRIAL',
                'SUBSCRIPTION_CREDIT',
                'ADMIN_ADJUSTMENT'
            ));