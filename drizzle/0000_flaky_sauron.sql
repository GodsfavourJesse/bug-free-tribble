CREATE TYPE "public"."account_type" AS ENUM('USER', 'DEALER');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'SUSPENDED', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."listing_condition" AS ENUM('NEW', 'USED');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED', 'SOLD', 'SUSPENDED', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."image_check_status" AS ENUM('PENDING', 'PASSED', 'REVIEW', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."listing_history_action" AS ENUM('CREATED', 'UPDATED', 'SUBMIT_FOR_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED', 'MARKED_SOLD', 'SUSPENDED', 'RESTORED', 'REACTIVATED', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."listing_share_platform" AS ENUM('WHATSAPP', 'FACEBOOK', 'X', 'COPY_LINK', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."listing_report_reason" AS ENUM('SCAM_OR_FRAUD', 'WRONG_VEHICLE_INFORMATION', 'DUPLICATE_LISTING', 'ALREADY_SOLD', 'INAPPROPRIATE_CONTENT', 'MISLEADING_PRICE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."listing_report_status" AS ENUM('PENDING', 'REVIEWING', 'RESOLVED', 'DISMISSED');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('PENDING', 'ACTIVE', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."subscription_history_event" AS ENUM('CREATED', 'PAYMENT_PENDING', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'ACTIVATED', 'RENEWED', 'CANCELLED', 'EXPIRED', 'REACTIVATED', 'REFUNDED', 'SUSPENDED', 'RESUMED', 'CREDIT_GRANTED', 'CREDIT_REVOKED');--> statement-breakpoint
CREATE TYPE "public"."dealer_application_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."boost_status" AS ENUM('PENDING', 'AWAITING_APPROVAL', 'ACTIVE', 'REJECTED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."conversation_type" AS ENUM('BUYER_SELLER', 'SUPPORT');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('GENERAL', 'LISTING_SUBMITTED', 'LISTING_APPROVED', 'LISTING_REJECTED', 'LISTING_EXPIRED', 'LISTING_SOLD', 'SUBSCRIPTION_PAYMENT_PENDING', 'SUBSCRIPTION_ACTIVATED', 'SUBSCRIPTION_EXPIRED', 'BOOST_PAYMENT_PENDING', 'BOOST_PAYMENT_SUCCESSFUL', 'BOOST_ACTIVATED', 'BOOST_EXPIRED', 'MESSAGE_RECEIVED', 'DEALER_VERIFIED', 'DEALER_APPLICATION_REJECTED');--> statement-breakpoint
CREATE TYPE "public"."payment_purpose" AS ENUM('SUBSCRIPTION', 'BOOST');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'SUCCESS', 'FAILED', 'ABANDONED', 'REVERSED', 'PROCESSING');--> statement-breakpoint
CREATE TYPE "public"."payment_event_processing_status" AS ENUM('RECEIVED', 'PROCESSING', 'PROCESSED', 'RETRY', 'DEAD_LETTER', 'IGNORED');--> statement-breakpoint
CREATE TYPE "public"."payment_event_signature_status" AS ENUM('UNKNOWN', 'VALID', 'INVALID');--> statement-breakpoint
CREATE TYPE "public"."payment_reconciliation_status" AS ENUM('PENDING', 'PROCESSING', 'RETRY', 'RESOLVED', 'DEAD_LETTER', 'IGNORED');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('PENDING', 'APPROVED', 'PROCESSING', 'SUCCESS', 'FAILED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."review_decision" AS ENUM('APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('IMAGE_ANALYSIS', 'NOTIFICATION_DISPATCH', 'LIFECYCLE');--> statement-breakpoint
CREATE TYPE "public"."vehicle_body_style" AS ENUM('SEDAN', 'SUV', 'COUPE', 'HATCHBACK', 'WAGON', 'MPV', 'PICKUP', 'VAN', 'CONVERTIBLE', 'TRUCK', 'BUS');--> statement-breakpoint
CREATE TYPE "public"."vehicle_drive_type" AS ENUM('FWD', 'RWD', 'AWD', 'FOUR_WD');--> statement-breakpoint
CREATE TYPE "public"."vehicle_fuel_type" AS ENUM('PETROL', 'DIESEL', 'HYBRID', 'PLUG_IN_HYBRID', 'ELECTRIC', 'CNG', 'LPG');--> statement-breakpoint
CREATE TYPE "public"."vehicle_transmission" AS ENUM('MANUAL', 'AUTOMATIC', 'CVT', 'DCT', 'AMT');--> statement-breakpoint
CREATE TYPE "public"."image_analysis_job_status" AS ENUM('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."image_analysis_decision" AS ENUM('PASSED', 'REVIEW', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."image_analysis_result_type" AS ENUM('SHA256', 'PERCEPTUAL_HASH', 'EMBEDDING', 'OCR', 'MODERATION', 'WATERMARK', 'DUPLICATE');--> statement-breakpoint
CREATE TYPE "public"."image_analysis_run_status" AS ENUM('RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"phone" varchar(30),
	"avatar_url" varchar(500),
	"profile_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"account_type" "account_type" DEFAULT 'USER' NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"deletion_requested_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(120) NOT NULL,
	"description" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permissions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(50) NOT NULL,
	"description" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"user_agent" varchar(500),
	"ip_address" varchar(64),
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "vehicle_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"name" varchar(150) NOT NULL,
	"slug" varchar(180) NOT NULL,
	"start_year" integer,
	"end_year" integer,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"nigeria_market" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_generations_model_name_unique" UNIQUE("model_id","name"),
	CONSTRAINT "vehicle_generations_model_slug_unique" UNIQUE("model_id","slug"),
	CONSTRAINT "vehicle_generations_year_range_check" CHECK (
                    start_year IS NULL
                    OR end_year IS NULL
                    OR end_year >= start_year
                )
);
--> statement-breakpoint
CREATE TABLE "vehicle_makes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"nigeria_market" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_makes_name_unique" UNIQUE("name"),
	CONSTRAINT "vehicle_makes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "vehicle_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"make_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"nigeria_market" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_models_make_name_unique" UNIQUE("make_id","name"),
	CONSTRAINT "vehicle_models_make_slug_unique" UNIQUE("make_id","slug")
);
--> statement-breakpoint
CREATE TABLE "listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"vehicle_variant_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"currency" varchar(10) DEFAULT 'NGN' NOT NULL,
	"mileage" integer,
	"condition" "listing_condition" DEFAULT 'USED' NOT NULL,
	"country" varchar(100) DEFAULT 'Nigeria' NOT NULL,
	"state" varchar(100),
	"city" varchar(100),
	"status" "listing_status" DEFAULT 'DRAFT' NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"rejection_reason" text,
	"published_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listings_price_non_negative" CHECK ("listings"."price" >= 0),
	CONSTRAINT "listings_mileage_non_negative" CHECK (
                "listings"."mileage" IS NULL
                OR "listings"."mileage" >= 0
            )
);
--> statement-breakpoint
CREATE TABLE "listing_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"object_key" varchar(500) NOT NULL,
	"original_name" varchar(255),
	"mime_type" varchar(100),
	"width" integer,
	"height" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"sha256" varchar(64),
	"perceptual_hash" varchar(64),
	"image_check_status" "image_check_status" DEFAULT 'PENDING' NOT NULL,
	"similarity_score" numeric(5, 2),
	"matched_image_id" uuid,
	"matched_listing_id" uuid,
	"check_reason" text,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_images_listing_sort_unique" UNIQUE("listing_id","sort_order")
);
--> statement-breakpoint
CREATE TABLE "listing_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" "listing_history_action" NOT NULL,
	"previous_status" varchar(50),
	"new_status" varchar(50),
	"reason" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"viewer_id" uuid,
	"viewer_key" varchar(128) NOT NULL,
	"viewed_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_views_daily_unique" UNIQUE("listing_id","viewer_key","viewed_date")
);
--> statement-breakpoint
CREATE TABLE "listing_favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"listing_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_favorites_user_listing_unique" UNIQUE("user_id","listing_id")
);
--> statement-breakpoint
CREATE TABLE "listing_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"user_id" uuid,
	"platform" "listing_share_platform" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reason" "listing_report_reason" NOT NULL,
	"details" text,
	"status" "listing_report_status" DEFAULT 'PENDING' NOT NULL,
	"resolution_note" text,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_reports_reporter_listing_unique" UNIQUE("reporter_id","listing_id")
);
--> statement-breakpoint
CREATE TABLE "subscription_plan_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"currency" varchar(10) DEFAULT 'NGN' NOT NULL,
	"duration_days" integer DEFAULT 30 NOT NULL,
	"listing_credits" integer NOT NULL,
	"dealer_discount_percent" numeric(5, 2) DEFAULT '30.00' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "subscription_plan_versions_price_non_negative" CHECK ("subscription_plan_versions"."price" >= 0),
	CONSTRAINT "subscription_plan_versions_duration_positive" CHECK ("subscription_plan_versions"."duration_days" > 0),
	CONSTRAINT "subscription_plan_versions_listing_credits_positive" CHECK ("subscription_plan_versions"."listing_credits" > 0),
	CONSTRAINT "subscription_plan_versions_discount_valid" CHECK (
                        "subscription_plan_versions"."dealer_discount_percent" >= 0
                        AND
                        "subscription_plan_versions"."dealer_discount_percent" <= 100
                    ),
	CONSTRAINT "subscription_plan_versions_version_positive" CHECK ("subscription_plan_versions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_plans_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"plan_version_id" uuid NOT NULL,
	"status" "subscription_status" DEFAULT 'PENDING' NOT NULL,
	"original_price" numeric(14, 2) NOT NULL,
	"dealer_discount_percent" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"effective_price" numeric(14, 2) NOT NULL,
	"currency" varchar(10) DEFAULT 'NGN' NOT NULL,
	"duration_days" integer NOT NULL,
	"listing_credits" integer NOT NULL,
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"previous_subscription_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_original_price_non_negative" CHECK ("subscriptions"."original_price" >= 0),
	CONSTRAINT "subscriptions_effective_price_non_negative" CHECK ("subscriptions"."effective_price" >= 0),
	CONSTRAINT "subscriptions_discount_valid" CHECK (
                        "subscriptions"."dealer_discount_percent" >= 0
                        AND
                        "subscriptions"."dealer_discount_percent" <= 100
                    ),
	CONSTRAINT "subscriptions_duration_positive" CHECK ("subscriptions"."duration_days" > 0),
	CONSTRAINT "subscriptions_listing_credits_positive" CHECK ("subscriptions"."listing_credits" > 0),
	CONSTRAINT "subscriptions_expiry_after_start" CHECK (
                        "subscriptions"."starts_at" IS NULL
                        OR
                        "subscriptions"."expires_at" IS NULL
                        OR
                        "subscriptions"."expires_at" > "subscriptions"."starts_at"
                    ),
	CONSTRAINT "subscriptions_cancellation_date_valid" CHECK (
                        "subscriptions"."cancelled_at" IS NULL
                        OR
                        "subscriptions"."starts_at" IS NULL
                        OR
                        "subscriptions"."cancelled_at" >= "subscriptions"."starts_at"
                    )
);
--> statement-breakpoint
CREATE TABLE "subscription_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"event" "subscription_history_event" NOT NULL,
	"previous_status" "subscription_status",
	"new_status" "subscription_status",
	"amount" numeric(14, 2),
	"currency" varchar(10),
	"reference_id" uuid,
	"reason" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "dealer_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_name" varchar(200) NOT NULL,
	"registration_number" varchar(100),
	"business_address" text,
	"status" "dealer_application_status" DEFAULT 'PENDING' NOT NULL,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dealer_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"document_type" varchar(100) NOT NULL,
	"object_key" varchar(500) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dealer_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_name" varchar(200) NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dealer_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "boost_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"duration_days" integer NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"currency" varchar(10) DEFAULT 'NGN' NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boost_plans_duration_positive" CHECK ("boost_plans"."duration_days" > 0),
	CONSTRAINT "boost_plans_price_non_negative" CHECK ("boost_plans"."price" >= 0),
	CONSTRAINT "boost_plans_active_valid" CHECK ("boost_plans"."active" IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE "listing_boosts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"boost_plan_id" uuid NOT NULL,
	"status" "boost_status" DEFAULT 'PENDING' NOT NULL,
	"payment_verified_at" timestamp with time zone,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" varchar(2000),
	"starts_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_boosts_expiry_after_start" CHECK (
                "listing_boosts"."starts_at" IS NULL
                OR "listing_boosts"."expires_at" IS NULL
                OR "listing_boosts"."expires_at" > "listing_boosts"."starts_at"
            ),
	CONSTRAINT "listing_boosts_active_requires_window" CHECK (
                "listing_boosts"."status" <> 'ACTIVE'
                OR (
                    "listing_boosts"."starts_at" IS NOT NULL
                    AND "listing_boosts"."expires_at" IS NOT NULL
                    AND "listing_boosts"."expires_at" > "listing_boosts"."starts_at"
                )
            )
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_participants_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "conversation_type" DEFAULT 'BUYER_SELLER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_verification_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_verification_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"in_app_enabled" boolean DEFAULT true NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" DEFAULT 'GENERAL' NOT NULL,
	"title" varchar(200) NOT NULL,
	"message" varchar(1000) NOT NULL,
	"data" jsonb,
	"read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" "payment_purpose" NOT NULL,
	"status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"reference" varchar(100) NOT NULL,
	"provider" varchar(50) DEFAULT 'PAYSTACK' NOT NULL,
	"gateway_transaction_id" varchar(100),
	"amount" numeric(14, 2) NOT NULL,
	"original_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"currency" varchar(10) NOT NULL,
	"subscription_id" uuid,
	"listing_boost_id" uuid,
	"provider_data" jsonb,
	"initialization_token" uuid,
	"initialization_expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_reference_unique" UNIQUE("reference"),
	CONSTRAINT "payments_amount_non_negative" CHECK ("payments"."amount" >= 0),
	CONSTRAINT "payments_original_amount_non_negative" CHECK ("payments"."original_amount" >= 0),
	CONSTRAINT "payments_discount_percent_valid" CHECK (
                    "payments"."discount_percent" >= 0
                    AND
                    "payments"."discount_percent" <= 100
                ),
	CONSTRAINT "payments_discount_amount_non_negative" CHECK ("payments"."discount_amount" >= 0),
	CONSTRAINT "payments_purpose_target_check" CHECK (
                (
                    "payments"."purpose" = 'SUBSCRIPTION'
                    AND
                    "payments"."subscription_id" IS NOT NULL
                    AND
                    "payments"."listing_boost_id" IS NULL
                )
                OR
                (
                    "payments"."purpose" = 'BOOST'
                    AND
                    "payments"."subscription_id" IS NULL
                    AND
                    "payments"."listing_boost_id" IS NOT NULL
                )
            )
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(50) DEFAULT 'PAYSTACK' NOT NULL,
	"provider_event_id" varchar(200),
	"event_type" varchar(150) NOT NULL,
	"payment_reference" varchar(100),
	"payment_id" uuid,
	"idempotency_key" varchar(64) NOT NULL,
	"signature_status" "payment_event_signature_status" DEFAULT 'UNKNOWN' NOT NULL,
	"processing_status" "payment_event_processing_status" DEFAULT 'RECEIVED' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"payload" jsonb NOT NULL,
	"last_error_code" varchar(100),
	"last_error_message" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone,
	"locked_until" timestamp with time zone,
	"locked_by" varchar(150),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_events_attempt_count_non_negative" CHECK ("payment_events"."attempt_count" >= 0),
	CONSTRAINT "payment_events_idempotency_key_length_check" CHECK (length("payment_events"."idempotency_key") = 64)
);
--> statement-breakpoint
CREATE TABLE "payment_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"status" "payment_reconciliation_status" DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"locked_until" timestamp with time zone,
	"locked_by" varchar(150),
	"last_error_code" varchar(100),
	"last_error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_reconciliations_attempt_count_check" CHECK ("payment_reconciliations"."attempt_count" >= 0),
	CONSTRAINT "payment_reconciliations_lease_consistency_check" CHECK (
                    (
                        "payment_reconciliations"."status" = 'PROCESSING'
                        AND "payment_reconciliations"."locked_by" IS NOT NULL
                        AND "payment_reconciliations"."locked_until" IS NOT NULL
                    )
                    OR
                    (
                        "payment_reconciliations"."status" <> 'PROCESSING'
                        AND "payment_reconciliations"."locked_by" IS NULL
                        AND "payment_reconciliations"."locked_until" IS NULL
                    )
                )
);
--> statement-breakpoint
CREATE TABLE "refund_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"reviewed_by" uuid,
	"status" "refund_status" DEFAULT 'PENDING' NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" varchar(10) NOT NULL,
	"reason" varchar(1000) NOT NULL,
	"review_note" varchar(1000),
	"provider" varchar(50) DEFAULT 'PAYSTACK' NOT NULL,
	"provider_refund_id" varchar(120),
	"provider_data" jsonb,
	"idempotency_key" varchar(120) NOT NULL,
	"attempt_count" numeric(10, 0) DEFAULT '0' NOT NULL,
	"last_error" varchar(2000),
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refund_requests_amount_positive" CHECK ("refund_requests"."amount" > 0),
	CONSTRAINT "refund_requests_attempt_count_non_negative" CHECK ("refund_requests"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" varchar(120) NOT NULL,
	"entity_type" varchar(80) NOT NULL,
	"entity_id" varchar(120),
	"ip_address" varchar(64),
	"user_agent" varchar(500),
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(120) NOT NULL,
	"value" jsonb NOT NULL,
	"description" varchar(500),
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" varchar(2000) NOT NULL,
	"keys" jsonb NOT NULL,
	"user_agent" varchar(500),
	"device_name" varchar(120),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "listing_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"decision" "review_decision" NOT NULL,
	"rejection_reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "job_type" NOT NULL,
	"status" "job_status" DEFAULT 'QUEUED' NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" varchar(255),
	"last_error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_attempts_valid" CHECK (
                "jobs"."attempts" >= 0
                AND
                "jobs"."max_attempts" > 0
                AND
                "jobs"."attempts" <= "jobs"."max_attempts"
            )
);
--> statement-breakpoint
CREATE TABLE "auth_login_throttles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"user_id" uuid,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_login_throttles_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "user_privacy_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"show_phone" boolean DEFAULT false NOT NULL,
	"show_email" boolean DEFAULT false NOT NULL,
	"allow_direct_messages" boolean DEFAULT true NOT NULL,
	"show_online_status" boolean DEFAULT true NOT NULL,
	"allow_marketing_emails" boolean DEFAULT true NOT NULL,
	"allow_marketing_sms" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL,
	"engine_id" uuid,
	"year" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"slug" varchar(220) NOT NULL,
	"engine_name" varchar(150),
	"engine_displacement_cc" integer,
	"cylinders" integer,
	"horsepower" integer,
	"fuel_type" "vehicle_fuel_type",
	"transmission" "vehicle_transmission",
	"drive_type" "vehicle_drive_type",
	"body_style" "vehicle_body_style",
	"seats" integer,
	"doors" integer,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"nigeria_market" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_variants_generation_year_slug_unique" UNIQUE("generation_id","year","slug"),
	CONSTRAINT "vehicle_variants_generation_year_name_unique" UNIQUE("generation_id","year","name"),
	CONSTRAINT "vehicle_variants_year_check" CHECK (
                    year >= 1886
                    AND year <= 2100
                ),
	CONSTRAINT "vehicle_variants_engine_displacement_check" CHECK (
                    engine_displacement_cc IS NULL
                    OR engine_displacement_cc > 0
                ),
	CONSTRAINT "vehicle_variants_cylinders_check" CHECK (
                    cylinders IS NULL
                    OR cylinders > 0
                ),
	CONSTRAINT "vehicle_variants_horsepower_check" CHECK (
                    horsepower IS NULL
                    OR horsepower > 0
                ),
	CONSTRAINT "vehicle_variants_seats_check" CHECK (
                    seats IS NULL
                    OR seats > 0
                ),
	CONSTRAINT "vehicle_variants_doors_check" CHECK (
                    doors IS NULL
                    OR doors > 0
                )
);
--> statement-breakpoint
CREATE TABLE "vehicle_engines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"name" varchar(150) NOT NULL,
	"slug" varchar(180) NOT NULL,
	"displacement_cc" integer,
	"cylinders" integer,
	"horsepower" integer,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"nigeria_market" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_engines_model_name_unique" UNIQUE("model_id","name"),
	CONSTRAINT "vehicle_engines_model_slug_unique" UNIQUE("model_id","slug"),
	CONSTRAINT "vehicle_engines_displacement_check" CHECK (
                    displacement_cc IS NULL
                    OR displacement_cc > 0
                ),
	CONSTRAINT "vehicle_engines_cylinders_check" CHECK (
                    cylinders IS NULL
                    OR cylinders > 0
                ),
	CONSTRAINT "vehicle_engines_horsepower_check" CHECK (
                    horsepower IS NULL
                    OR horsepower > 0
                )
);
--> statement-breakpoint
CREATE TABLE "image_analysis_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_image_id" uuid NOT NULL,
	"analysis_run_id" uuid,
	"status" "image_analysis_job_status" DEFAULT 'QUEUED' NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "image_analysis_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"listing_image_id" uuid NOT NULL,
	"result_type" "image_analysis_result_type" NOT NULL,
	"provider" varchar(100) NOT NULL,
	"provider_version" varchar(100),
	"model_version" varchar(100),
	"confidence" numeric(5, 2),
	"score" numeric(10, 4),
	"passed" boolean,
	"data" jsonb,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "image_analysis_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_image_id" uuid NOT NULL,
	"job_id" uuid,
	"status" "image_analysis_run_status" DEFAULT 'RUNNING' NOT NULL,
	"provider" varchar(100) DEFAULT 'karmass' NOT NULL,
	"provider_version" varchar(100),
	"pipeline_version" varchar(100) DEFAULT '1.0.0' NOT NULL,
	"model_version" varchar(100),
	"decision" "image_analysis_decision",
	"confidence" numeric(5, 2),
	"decision_reason" text,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"reason" varchar(100) NOT NULL,
	"reference_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listing_credit_ledger_amount_nonzero_check" CHECK ("listing_credit_ledger"."amount" <> 0)
);
--> statement-breakpoint
CREATE TABLE "saved_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_generations" ADD CONSTRAINT "vehicle_generations_model_id_vehicle_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."vehicle_models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_make_id_vehicle_makes_id_fk" FOREIGN KEY ("make_id") REFERENCES "public"."vehicle_makes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_seller_id_users_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_vehicle_variant_id_vehicle_variants_id_fk" FOREIGN KEY ("vehicle_variant_id") REFERENCES "public"."vehicle_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_images" ADD CONSTRAINT "listing_images_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_history" ADD CONSTRAINT "listing_history_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_history" ADD CONSTRAINT "listing_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_views" ADD CONSTRAINT "listing_views_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_views" ADD CONSTRAINT "listing_views_viewer_id_users_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_favorites" ADD CONSTRAINT "listing_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_favorites" ADD CONSTRAINT "listing_favorites_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_shares" ADD CONSTRAINT "listing_shares_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_shares" ADD CONSTRAINT "listing_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_reports" ADD CONSTRAINT "listing_reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_plan_versions" ADD CONSTRAINT "subscription_plan_versions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_plan_versions" ADD CONSTRAINT "subscription_plan_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_version_id_subscription_plan_versions_id_fk" FOREIGN KEY ("plan_version_id") REFERENCES "public"."subscription_plan_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_applications" ADD CONSTRAINT "dealer_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_documents" ADD CONSTRAINT "dealer_documents_application_id_dealer_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."dealer_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_profiles" ADD CONSTRAINT "dealer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_boosts" ADD CONSTRAINT "listing_boosts_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_boosts" ADD CONSTRAINT "listing_boosts_boost_plan_id_boost_plans_id_fk" FOREIGN KEY ("boost_plan_id") REFERENCES "public"."boost_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_boosts" ADD CONSTRAINT "listing_boosts_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_listing_boost_id_listing_boosts_id_fk" FOREIGN KEY ("listing_boost_id") REFERENCES "public"."listing_boosts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reconciliations" ADD CONSTRAINT "payment_reconciliations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_reviews" ADD CONSTRAINT "listing_reviews_listing_id_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_reviews" ADD CONSTRAINT "listing_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_login_throttles" ADD CONSTRAINT "auth_login_throttles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_privacy_settings" ADD CONSTRAINT "user_privacy_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_variants" ADD CONSTRAINT "vehicle_variants_generation_id_vehicle_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."vehicle_generations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_variants" ADD CONSTRAINT "vehicle_variants_engine_id_vehicle_engines_id_fk" FOREIGN KEY ("engine_id") REFERENCES "public"."vehicle_engines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_engines" ADD CONSTRAINT "vehicle_engines_model_id_vehicle_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."vehicle_models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_analysis_jobs" ADD CONSTRAINT "image_analysis_jobs_listing_image_id_listing_images_id_fk" FOREIGN KEY ("listing_image_id") REFERENCES "public"."listing_images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_analysis_results" ADD CONSTRAINT "image_analysis_results_run_id_image_analysis_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."image_analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_analysis_results" ADD CONSTRAINT "image_analysis_results_listing_image_id_listing_images_id_fk" FOREIGN KEY ("listing_image_id") REFERENCES "public"."listing_images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "image_analysis_runs" ADD CONSTRAINT "image_analysis_runs_listing_image_id_listing_images_id_fk" FOREIGN KEY ("listing_image_id") REFERENCES "public"."listing_images"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing_credit_ledger" ADD CONSTRAINT "listing_credit_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "permissions_key_idx" ON "permissions" USING btree ("key");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_idx" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE INDEX "role_permissions_role_idx" ON "role_permissions" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "roles_name_idx" ON "roles" USING btree ("name");--> statement-breakpoint
CREATE INDEX "user_roles_user_idx" ON "user_roles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "sessions_active_idx" ON "sessions" USING btree ("user_id","revoked_at","expires_at");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "vehicle_generations_model_idx" ON "vehicle_generations" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "vehicle_generations_active_idx" ON "vehicle_generations" USING btree ("model_id","active");--> statement-breakpoint
CREATE INDEX "vehicle_generations_nigeria_market_idx" ON "vehicle_generations" USING btree ("model_id","nigeria_market");--> statement-breakpoint
CREATE INDEX "vehicle_makes_active_idx" ON "vehicle_makes" USING btree ("active");--> statement-breakpoint
CREATE INDEX "vehicle_makes_nigeria_market_idx" ON "vehicle_makes" USING btree ("nigeria_market");--> statement-breakpoint
CREATE INDEX "vehicle_models_make_idx" ON "vehicle_models" USING btree ("make_id");--> statement-breakpoint
CREATE INDEX "vehicle_models_active_idx" ON "vehicle_models" USING btree ("make_id","active");--> statement-breakpoint
CREATE INDEX "vehicle_models_nigeria_market_idx" ON "vehicle_models" USING btree ("make_id","nigeria_market");--> statement-breakpoint
CREATE INDEX "listings_seller_status_idx" ON "listings" USING btree ("seller_id","status");--> statement-breakpoint
CREATE INDEX "listings_seller_created_idx" ON "listings" USING btree ("seller_id","created_at");--> statement-breakpoint
CREATE INDEX "listings_marketplace_idx" ON "listings" USING btree ("status","expires_at","created_at");--> statement-breakpoint
CREATE INDEX "listings_vehicle_variant_idx" ON "listings" USING btree ("vehicle_variant_id");--> statement-breakpoint
CREATE INDEX "listings_price_idx" ON "listings" USING btree ("price");--> statement-breakpoint
CREATE INDEX "listings_state_city_idx" ON "listings" USING btree ("state","city");--> statement-breakpoint
CREATE INDEX "listing_images_listing_idx" ON "listing_images" USING btree ("listing_id","sort_order");--> statement-breakpoint
CREATE INDEX "listing_images_sha256_idx" ON "listing_images" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "listing_images_perceptual_hash_idx" ON "listing_images" USING btree ("perceptual_hash");--> statement-breakpoint
CREATE INDEX "listing_images_status_idx" ON "listing_images" USING btree ("image_check_status");--> statement-breakpoint
CREATE INDEX "listing_history_listing_idx" ON "listing_history" USING btree ("listing_id","created_at");--> statement-breakpoint
CREATE INDEX "listing_history_actor_idx" ON "listing_history" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "listing_history_action_idx" ON "listing_history" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "listing_views_listing_date_idx" ON "listing_views" USING btree ("listing_id","viewed_date");--> statement-breakpoint
CREATE INDEX "listing_views_viewer_idx" ON "listing_views" USING btree ("viewer_id","created_at");--> statement-breakpoint
CREATE INDEX "listing_views_viewer_key_idx" ON "listing_views" USING btree ("viewer_key","created_at");--> statement-breakpoint
CREATE INDEX "listing_favorites_user_created_idx" ON "listing_favorites" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "listing_favorites_listing_idx" ON "listing_favorites" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "listing_shares_listing_created_idx" ON "listing_shares" USING btree ("listing_id","created_at");--> statement-breakpoint
CREATE INDEX "listing_shares_user_created_idx" ON "listing_shares" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "listing_shares_platform_created_idx" ON "listing_shares" USING btree ("platform","created_at");--> statement-breakpoint
CREATE INDEX "listing_reports_listing_status_idx" ON "listing_reports" USING btree ("listing_id","status","created_at");--> statement-breakpoint
CREATE INDEX "listing_reports_reporter_created_idx" ON "listing_reports" USING btree ("reporter_id","created_at");--> statement-breakpoint
CREATE INDEX "listing_reports_status_created_idx" ON "listing_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "listing_reports_resolved_by_idx" ON "listing_reports" USING btree ("resolved_by","resolved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_plan_versions_plan_version_unique_idx" ON "subscription_plan_versions" USING btree ("plan_id","version");--> statement-breakpoint
CREATE INDEX "subscription_plan_versions_plan_idx" ON "subscription_plan_versions" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "subscription_plan_versions_active_idx" ON "subscription_plan_versions" USING btree ("active");--> statement-breakpoint
CREATE INDEX "subscription_plans_active_idx" ON "subscription_plans" USING btree ("active");--> statement-breakpoint
CREATE INDEX "subscriptions_user_status_idx" ON "subscriptions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "subscriptions_expires_idx" ON "subscriptions" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "subscriptions_plan_version_idx" ON "subscriptions" USING btree ("plan_version_id");--> statement-breakpoint
CREATE INDEX "subscriptions_previous_subscription_idx" ON "subscriptions" USING btree ("previous_subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_one_active_per_user_idx" ON "subscriptions" USING btree ("user_id") WHERE "subscriptions"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_one_pending_per_user_idx" ON "subscriptions" USING btree ("user_id") WHERE "subscriptions"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "subscription_history_subscription_created_idx" ON "subscription_history" USING btree ("subscription_id","created_at");--> statement-breakpoint
CREATE INDEX "subscription_history_user_created_idx" ON "subscription_history" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "subscription_history_event_idx" ON "subscription_history" USING btree ("event");--> statement-breakpoint
CREATE INDEX "subscription_history_reference_idx" ON "subscription_history" USING btree ("reference_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dealer_applications_one_pending_idx" ON "dealer_applications" USING btree ("user_id") WHERE "dealer_applications"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "boost_plans_active_duration_idx" ON "boost_plans" USING btree ("active","duration_days");--> statement-breakpoint
CREATE INDEX "listing_boosts_listing_status_idx" ON "listing_boosts" USING btree ("listing_id","status");--> statement-breakpoint
CREATE INDEX "listing_boosts_active_expires_idx" ON "listing_boosts" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "listing_boosts_approval_queue_idx" ON "listing_boosts" USING btree ("status","payment_verified_at");--> statement-breakpoint
CREATE INDEX "listing_boosts_reviewed_by_idx" ON "listing_boosts" USING btree ("reviewed_by");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_boosts_one_active_idx" ON "listing_boosts" USING btree ("listing_id") WHERE "listing_boosts"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "listing_boosts_one_pending_idx" ON "listing_boosts" USING btree ("listing_id") WHERE "listing_boosts"."status" = 'PENDING';--> statement-breakpoint
CREATE UNIQUE INDEX "listing_boosts_one_awaiting_approval_idx" ON "listing_boosts" USING btree ("listing_id") WHERE "listing_boosts"."status" = 'AWAITING_APPROVAL';--> statement-breakpoint
CREATE UNIQUE INDEX "payments_gateway_transaction_id_unique_idx" ON "payments" USING btree ("gateway_transaction_id") WHERE 
                        "payments"."gateway_transaction_id"
                        IS NOT NULL
                    ;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_pending_subscription_unique_idx" ON "payments" USING btree ("subscription_id") WHERE 
                    "payments"."purpose" = 'SUBSCRIPTION'
                    AND
                    "payments"."status" = 'PENDING'
                    AND
                    "payments"."subscription_id" IS NOT NULL
                ;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_pending_boost_unique_idx" ON "payments" USING btree ("listing_boost_id") WHERE 
                        "payments"."purpose" = 'BOOST'
                        AND
                        "payments"."status" = 'PENDING'
                        AND
                        "payments"."listing_boost_id" IS NOT NULL
                    ;--> statement-breakpoint
CREATE INDEX "payments_user_created_idx" ON "payments" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "payments_status_created_idx" ON "payments" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "payments_subscription_idx" ON "payments" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "payments_listing_boost_idx" ON "payments" USING btree ("listing_boost_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_idempotency_unique_idx" ON "payment_events" USING btree ("provider","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_provider_event_unique_idx" ON "payment_events" USING btree ("provider","provider_event_id") WHERE "payment_events"."provider_event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "payment_events_payment_reference_idx" ON "payment_events" USING btree ("payment_reference");--> statement-breakpoint
CREATE INDEX "payment_events_payment_id_idx" ON "payment_events" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_events_status_received_idx" ON "payment_events" USING btree ("processing_status","received_at");--> statement-breakpoint
CREATE INDEX "payment_events_retry_schedule_idx" ON "payment_events" USING btree ("processing_status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "payment_events_locked_until_idx" ON "payment_events" USING btree ("locked_until");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_reconciliations_payment_unique_idx" ON "payment_reconciliations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_reconciliations_status_next_attempt_idx" ON "payment_reconciliations" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "payment_reconciliations_locked_until_idx" ON "payment_reconciliations" USING btree ("locked_until");--> statement-breakpoint
CREATE INDEX "refund_requests_payment_idx" ON "refund_requests" USING btree ("payment_id","created_at");--> statement-breakpoint
CREATE INDEX "refund_requests_status_created_idx" ON "refund_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "refund_requests_requester_idx" ON "refund_requests" USING btree ("requested_by","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "refund_requests_provider_refund_unique_idx" ON "refund_requests" USING btree ("provider","provider_refund_id") WHERE "refund_requests"."provider_refund_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "refund_requests_idempotency_unique_idx" ON "refund_requests" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "platform_settings_updated_by_idx" ON "platform_settings" USING btree ("updated_by");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id","active");--> statement-breakpoint
CREATE INDEX "jobs_queue_idx" ON "jobs" USING btree ("status","available_at","created_at");--> statement-breakpoint
CREATE INDEX "jobs_stale_idx" ON "jobs" USING btree ("status","locked_at");--> statement-breakpoint
CREATE INDEX "jobs_type_status_idx" ON "jobs" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "auth_login_throttles_user_idx" ON "auth_login_throttles" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "auth_login_throttles_lock_idx" ON "auth_login_throttles" USING btree ("locked_until");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_login_throttles_key_unique_idx" ON "auth_login_throttles" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_idx" ON "password_reset_tokens" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_expiry_idx" ON "password_reset_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_one_active_per_user_idx" ON "password_reset_tokens" USING btree ("user_id") WHERE "password_reset_tokens"."used_at" IS NULL;--> statement-breakpoint
CREATE INDEX "vehicle_variants_generation_idx" ON "vehicle_variants" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX "vehicle_variants_engine_idx" ON "vehicle_variants" USING btree ("engine_id");--> statement-breakpoint
CREATE INDEX "vehicle_variants_year_idx" ON "vehicle_variants" USING btree ("year");--> statement-breakpoint
CREATE INDEX "vehicle_variants_active_idx" ON "vehicle_variants" USING btree ("generation_id","active");--> statement-breakpoint
CREATE INDEX "vehicle_variants_market_idx" ON "vehicle_variants" USING btree ("nigeria_market","active");--> statement-breakpoint
CREATE INDEX "vehicle_variants_fuel_idx" ON "vehicle_variants" USING btree ("fuel_type");--> statement-breakpoint
CREATE INDEX "vehicle_variants_transmission_idx" ON "vehicle_variants" USING btree ("transmission");--> statement-breakpoint
CREATE INDEX "vehicle_variants_body_idx" ON "vehicle_variants" USING btree ("body_style");--> statement-breakpoint
CREATE INDEX "vehicle_engines_model_idx" ON "vehicle_engines" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "vehicle_engines_active_idx" ON "vehicle_engines" USING btree ("model_id","active");--> statement-breakpoint
CREATE INDEX "vehicle_engines_market_idx" ON "vehicle_engines" USING btree ("model_id","nigeria_market","active");--> statement-breakpoint
CREATE INDEX "image_analysis_jobs_status_available_idx" ON "image_analysis_jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "image_analysis_jobs_image_idx" ON "image_analysis_jobs" USING btree ("listing_image_id");--> statement-breakpoint
CREATE INDEX "image_analysis_jobs_locked_idx" ON "image_analysis_jobs" USING btree ("locked_at");--> statement-breakpoint
CREATE INDEX "image_analysis_jobs_priority_idx" ON "image_analysis_jobs" USING btree ("priority","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "image_analysis_jobs_active_image_unique_idx" ON "image_analysis_jobs" USING btree ("listing_image_id") WHERE "image_analysis_jobs"."status" IN ('QUEUED', 'PROCESSING');--> statement-breakpoint
CREATE INDEX "image_analysis_results_run_idx" ON "image_analysis_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "image_analysis_results_listing_image_idx" ON "image_analysis_results" USING btree ("listing_image_id");--> statement-breakpoint
CREATE INDEX "image_analysis_results_type_idx" ON "image_analysis_results" USING btree ("result_type");--> statement-breakpoint
CREATE INDEX "image_analysis_results_created_at_idx" ON "image_analysis_results" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "image_analysis_runs_listing_image_idx" ON "image_analysis_runs" USING btree ("listing_image_id");--> statement-breakpoint
CREATE INDEX "image_analysis_runs_status_idx" ON "image_analysis_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "image_analysis_runs_created_at_idx" ON "image_analysis_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "image_analysis_runs_decision_idx" ON "image_analysis_runs" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "listing_credit_ledger_user_created_idx" ON "listing_credit_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "listing_credit_ledger_reason_idx" ON "listing_credit_ledger" USING btree ("reason");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_credit_ledger_reference_unique_idx" ON "listing_credit_ledger" USING btree ("user_id","reason","reference_id");--> statement-breakpoint
CREATE INDEX "saved_searches_user_id_idx" ON "saved_searches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "saved_searches_user_created_at_idx" ON "saved_searches" USING btree ("user_id","created_at");