ALTER TYPE "public"."notification_type" ADD VALUE 'SUBSCRIPTION_EXPIRY_REMINDER' BEFORE 'BOOST_PAYMENT_PENDING';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'BOOST_PAYMENT_RECEIVED' BEFORE 'BOOST_ACTIVATED';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'BOOST_EXPIRY_REMINDER' BEFORE 'BOOST_EXPIRED';