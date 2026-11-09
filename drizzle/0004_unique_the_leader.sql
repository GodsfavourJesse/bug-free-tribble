ALTER TABLE "subscription_plan_versions" DROP CONSTRAINT "subscription_plan_versions_discount_valid";--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_discount_valid";--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'STARTED'::text;--> statement-breakpoint
DROP TYPE "public"."payment_status";--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('STARTED', 'ABANDONED', 'FAILED', 'SUCCESS');--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'STARTED'::"public"."payment_status";--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "status" SET DATA TYPE "public"."payment_status" USING "status"::"public"."payment_status";--> statement-breakpoint
DROP INDEX "payments_pending_subscription_unique_idx";--> statement-breakpoint
DROP INDEX "payments_pending_boost_unique_idx";--> statement-breakpoint
ALTER TABLE "listing_credit_ledger" ALTER COLUMN "reference_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_plan_versions" ADD COLUMN "normal_user_discount_percent" numeric(5, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "normal_user_discount_percent" numeric(5, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "applied_discount_percent" numeric(5, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "checkout_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_started_subscription_unique_idx" ON "payments" USING btree ("subscription_id") WHERE 
                        "payments"."purpose" = 'SUBSCRIPTION'
                        AND
                        "payments"."status" = 'STARTED'
                        AND
                        "payments"."subscription_id" IS NOT NULL
                    ;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_started_boost_unique_idx" ON "payments" USING btree ("listing_boost_id") WHERE 
                        "payments"."purpose" = 'BOOST'
                        AND
                        "payments"."status" = 'STARTED'
                        AND
                        "payments"."listing_boost_id" IS NOT NULL
                    ;--> statement-breakpoint
ALTER TABLE "subscription_plan_versions" ADD CONSTRAINT "subscription_plan_versions_normal_user_discount_valid" CHECK (
                        "subscription_plan_versions"."normal_user_discount_percent" >= 0
                        AND
                        "subscription_plan_versions"."normal_user_discount_percent" <= 100
                    );--> statement-breakpoint
ALTER TABLE "subscription_plan_versions" ADD CONSTRAINT "subscription_plan_versions_dealer_discount_valid" CHECK (
                        "subscription_plan_versions"."dealer_discount_percent" >= 0
                        AND
                        "subscription_plan_versions"."dealer_discount_percent" <= 100
                    );--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_normal_user_discount_valid" CHECK (
                        "subscriptions"."normal_user_discount_percent" >= 0
                        AND
                        "subscriptions"."normal_user_discount_percent" <= 100
                    );--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_dealer_discount_valid" CHECK (
                        "subscriptions"."dealer_discount_percent" >= 0
                        AND
                        "subscriptions"."dealer_discount_percent" <= 100
                    );--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_applied_discount_valid" CHECK (
                        "subscriptions"."applied_discount_percent" >= 0
                        AND
                        "subscriptions"."applied_discount_percent" <= 100
                    );--> statement-breakpoint
ALTER TABLE "listing_credit_ledger" ADD CONSTRAINT "listing_credit_ledger_reason_source_check" CHECK (
                (
                    "listing_credit_ledger"."reason" = 'FREE_TRIAL'
                    AND "listing_credit_ledger"."credit_source" = 'FREE_TRIAL'
                    AND "listing_credit_ledger"."amount" > 0
                )
                OR
                (
                    "listing_credit_ledger"."reason" = 'SUBSCRIPTION_CREDIT'
                    AND "listing_credit_ledger"."credit_source" = 'SUBSCRIPTION_CREDIT'
                    AND "listing_credit_ledger"."amount" > 0
                )
                OR
                (
                    "listing_credit_ledger"."reason" = 'ADMIN_ADJUSTMENT'
                    AND "listing_credit_ledger"."credit_source" = 'ADMIN_ADJUSTMENT'
                )
                OR
                (
                    "listing_credit_ledger"."reason" = 'LISTING_CREATED'
                    AND "listing_credit_ledger"."amount" = -1
                )
            );