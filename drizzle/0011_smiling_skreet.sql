CREATE TABLE "vehicle_model_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"nigeria_market" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_model_years_generation_year_unique" UNIQUE("generation_id","year"),
	CONSTRAINT "vehicle_model_years_year_check" CHECK (
                year >= 1886
                AND year <= 2100
            )
);
--> statement-breakpoint
CREATE TABLE "vehicle_model_year_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_year_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_model_year_variants_year_variant_unique" UNIQUE("model_year_id","variant_id")
);
--> statement-breakpoint
ALTER TABLE "vehicle_generations" DROP CONSTRAINT "vehicle_generations_year_range_check";--> statement-breakpoint
ALTER TABLE "vehicle_generations" DROP CONSTRAINT "vehicle_generations_model_id_vehicle_models_id_fk";
--> statement-breakpoint
ALTER TABLE "vehicle_models" DROP CONSTRAINT "vehicle_models_make_id_vehicle_makes_id_fk";
--> statement-breakpoint
DROP INDEX "vehicle_generations_model_idx";--> statement-breakpoint
DROP INDEX "vehicle_models_make_idx";--> statement-breakpoint
DROP INDEX "vehicle_generations_active_idx";--> statement-breakpoint
DROP INDEX "vehicle_generations_nigeria_market_idx";--> statement-breakpoint
DROP INDEX "vehicle_models_active_idx";--> statement-breakpoint
DROP INDEX "vehicle_models_nigeria_market_idx";--> statement-breakpoint
ALTER TABLE "vehicle_model_years" ADD CONSTRAINT "vehicle_model_years_generation_id_vehicle_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."vehicle_generations"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vehicle_model_year_variants" ADD CONSTRAINT "vehicle_model_year_variants_model_year_id_vehicle_model_years_id_fk" FOREIGN KEY ("model_year_id") REFERENCES "public"."vehicle_model_years"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vehicle_model_year_variants" ADD CONSTRAINT "vehicle_model_year_variants_variant_id_vehicle_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."vehicle_variants"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "vehicle_model_years_generation_idx" ON "vehicle_model_years" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX "vehicle_model_years_lookup_idx" ON "vehicle_model_years" USING btree ("generation_id","active","year");--> statement-breakpoint
CREATE INDEX "vehicle_model_years_market_idx" ON "vehicle_model_years" USING btree ("nigeria_market","active");--> statement-breakpoint
CREATE INDEX "vehicle_model_year_variants_model_year_idx" ON "vehicle_model_year_variants" USING btree ("model_year_id");--> statement-breakpoint
CREATE INDEX "vehicle_model_year_variants_variant_idx" ON "vehicle_model_year_variants" USING btree ("variant_id");--> statement-breakpoint
ALTER TABLE "vehicle_generations" ADD CONSTRAINT "vehicle_generations_model_id_vehicle_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."vehicle_models"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vehicle_models" ADD CONSTRAINT "vehicle_models_make_id_vehicle_makes_id_fk" FOREIGN KEY ("make_id") REFERENCES "public"."vehicle_makes"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "vehicle_generations_model_id_idx" ON "vehicle_generations" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "vehicle_generations_year_range_idx" ON "vehicle_generations" USING btree ("start_year","end_year");--> statement-breakpoint
CREATE INDEX "vehicle_makes_name_idx" ON "vehicle_makes" USING btree ("name");--> statement-breakpoint
CREATE INDEX "vehicle_models_make_id_idx" ON "vehicle_models" USING btree ("make_id");--> statement-breakpoint
CREATE INDEX "vehicle_models_name_idx" ON "vehicle_models" USING btree ("name");--> statement-breakpoint
CREATE INDEX "vehicle_generations_active_idx" ON "vehicle_generations" USING btree ("active");--> statement-breakpoint
CREATE INDEX "vehicle_generations_nigeria_market_idx" ON "vehicle_generations" USING btree ("nigeria_market");--> statement-breakpoint
CREATE INDEX "vehicle_models_active_idx" ON "vehicle_models" USING btree ("active");--> statement-breakpoint
CREATE INDEX "vehicle_models_nigeria_market_idx" ON "vehicle_models" USING btree ("nigeria_market");--> statement-breakpoint
ALTER TABLE "vehicle_generations" ADD CONSTRAINT "vehicle_generations_year_range_check" CHECK (
                (
                    "vehicle_generations"."start_year" IS NULL
                    OR "vehicle_generations"."end_year" IS NULL
                    OR "vehicle_generations"."start_year" <= "vehicle_generations"."end_year"
                )
            );