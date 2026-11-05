CREATE TABLE "vehicle_engine_markets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engine_id" uuid NOT NULL,
	"market_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_engine_markets_unique" UNIQUE("engine_id","market_id")
);
--> statement-breakpoint
CREATE TABLE "vehicle_generation_markets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL,
	"market_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_generation_markets_unique" UNIQUE("generation_id","market_id")
);
--> statement-breakpoint
CREATE TABLE "vehicle_make_markets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"make_id" uuid NOT NULL,
	"market_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_make_markets_unique" UNIQUE("make_id","market_id")
);
--> statement-breakpoint
CREATE TABLE "vehicle_markets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"name" varchar(100) NOT NULL,
	"currency_code" varchar(3),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_markets_country_code_unique" UNIQUE("country_code"),
	CONSTRAINT "vehicle_markets_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "vehicle_model_markets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"market_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_model_markets_unique" UNIQUE("model_id","market_id")
);
--> statement-breakpoint
CREATE TABLE "vehicle_model_year_markets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_year_id" uuid NOT NULL,
	"market_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_model_year_markets_unique" UNIQUE("model_year_id","market_id")
);
--> statement-breakpoint
CREATE TABLE "vehicle_variant_markets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"market_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_variant_markets_unique" UNIQUE("variant_id","market_id")
);
--> statement-breakpoint
ALTER TABLE "vehicle_variants" DROP CONSTRAINT "vehicle_variants_year_check";--> statement-breakpoint
ALTER TABLE "vehicle_variants" DROP CONSTRAINT "vehicle_variants_engine_displacement_check";--> statement-breakpoint
ALTER TABLE "vehicle_variants" DROP CONSTRAINT "vehicle_variants_cylinders_check";--> statement-breakpoint
ALTER TABLE "vehicle_variants" DROP CONSTRAINT "vehicle_variants_horsepower_check";--> statement-breakpoint
ALTER TABLE "vehicle_variants" DROP CONSTRAINT "vehicle_variants_seats_check";--> statement-breakpoint
ALTER TABLE "vehicle_variants" DROP CONSTRAINT "vehicle_variants_doors_check";--> statement-breakpoint
ALTER TABLE "vehicle_engines" DROP CONSTRAINT "vehicle_engines_displacement_check";--> statement-breakpoint
ALTER TABLE "vehicle_engines" DROP CONSTRAINT "vehicle_engines_cylinders_check";--> statement-breakpoint
ALTER TABLE "vehicle_engines" DROP CONSTRAINT "vehicle_engines_horsepower_check";--> statement-breakpoint
ALTER TABLE "vehicle_variants" DROP CONSTRAINT "vehicle_variants_generation_id_vehicle_generations_id_fk";
--> statement-breakpoint
ALTER TABLE "vehicle_variants" DROP CONSTRAINT "vehicle_variants_engine_id_vehicle_engines_id_fk";
--> statement-breakpoint
ALTER TABLE "vehicle_engines" DROP CONSTRAINT "vehicle_engines_model_id_vehicle_models_id_fk";
--> statement-breakpoint
ALTER TABLE "vehicle_variants" ADD COLUMN "model_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicle_model_year_variants" ADD COLUMN "generation_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicle_model_year_variants" ADD COLUMN "year" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicle_engine_markets" ADD CONSTRAINT "vehicle_engine_markets_engine_id_vehicle_engines_id_fk" FOREIGN KEY ("engine_id") REFERENCES "public"."vehicle_engines"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vehicle_engine_markets" ADD CONSTRAINT "vehicle_engine_markets_market_id_vehicle_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."vehicle_markets"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vehicle_generation_markets" ADD CONSTRAINT "vehicle_generation_markets_generation_id_vehicle_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."vehicle_generations"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vehicle_generation_markets" ADD CONSTRAINT "vehicle_generation_markets_market_id_vehicle_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."vehicle_markets"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vehicle_make_markets" ADD CONSTRAINT "vehicle_make_markets_make_id_vehicle_makes_id_fk" FOREIGN KEY ("make_id") REFERENCES "public"."vehicle_makes"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vehicle_make_markets" ADD CONSTRAINT "vehicle_make_markets_market_id_vehicle_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."vehicle_markets"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vehicle_model_markets" ADD CONSTRAINT "vehicle_model_markets_model_id_vehicle_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."vehicle_models"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vehicle_model_markets" ADD CONSTRAINT "vehicle_model_markets_market_id_vehicle_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."vehicle_markets"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vehicle_model_year_markets" ADD CONSTRAINT "vehicle_model_year_markets_model_year_id_vehicle_model_years_id_fk" FOREIGN KEY ("model_year_id") REFERENCES "public"."vehicle_model_years"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vehicle_model_year_markets" ADD CONSTRAINT "vehicle_model_year_markets_market_id_vehicle_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."vehicle_markets"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vehicle_variant_markets" ADD CONSTRAINT "vehicle_variant_markets_variant_id_vehicle_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."vehicle_variants"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vehicle_variant_markets" ADD CONSTRAINT "vehicle_variant_markets_market_id_vehicle_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."vehicle_markets"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "vehicle_engine_markets_engine_idx" ON "vehicle_engine_markets" USING btree ("engine_id");--> statement-breakpoint
CREATE INDEX "vehicle_engine_markets_market_idx" ON "vehicle_engine_markets" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "vehicle_generation_markets_generation_idx" ON "vehicle_generation_markets" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX "vehicle_generation_markets_market_idx" ON "vehicle_generation_markets" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "vehicle_make_markets_make_idx" ON "vehicle_make_markets" USING btree ("make_id");--> statement-breakpoint
CREATE INDEX "vehicle_make_markets_market_idx" ON "vehicle_make_markets" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "vehicle_markets_active_idx" ON "vehicle_markets" USING btree ("active");--> statement-breakpoint
CREATE INDEX "vehicle_markets_country_code_idx" ON "vehicle_markets" USING btree ("country_code");--> statement-breakpoint
CREATE INDEX "vehicle_model_markets_model_idx" ON "vehicle_model_markets" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "vehicle_model_markets_market_idx" ON "vehicle_model_markets" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "vehicle_model_year_markets_model_year_idx" ON "vehicle_model_year_markets" USING btree ("model_year_id");--> statement-breakpoint
CREATE INDEX "vehicle_model_year_markets_market_idx" ON "vehicle_model_year_markets" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "vehicle_variant_markets_variant_idx" ON "vehicle_variant_markets" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "vehicle_variant_markets_market_idx" ON "vehicle_variant_markets" USING btree ("market_id");--> statement-breakpoint
ALTER TABLE "vehicle_variants" ADD CONSTRAINT "vehicle_variants_model_id_vehicle_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."vehicle_models"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vehicle_variants" ADD CONSTRAINT "vehicle_variants_generation_model_fk" FOREIGN KEY ("generation_id","model_id") REFERENCES "public"."vehicle_generations"("id","model_id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vehicle_variants" ADD CONSTRAINT "vehicle_variants_engine_model_fk" FOREIGN KEY ("engine_id","model_id") REFERENCES "public"."vehicle_engines"("id","model_id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vehicle_variants" ADD CONSTRAINT "vehicle_variants_generation_id_vehicle_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."vehicle_generations"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vehicle_variants" ADD CONSTRAINT "vehicle_variants_engine_id_vehicle_engines_id_fk" FOREIGN KEY ("engine_id") REFERENCES "public"."vehicle_engines"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vehicle_engines" ADD CONSTRAINT "vehicle_engines_model_id_vehicle_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."vehicle_models"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vehicle_model_year_variants" ADD CONSTRAINT "vehicle_model_year_variants_generation_id_vehicle_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."vehicle_generations"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vehicle_model_year_variants" ADD CONSTRAINT "vehicle_model_year_variants_year_generation_fk" FOREIGN KEY ("model_year_id","generation_id","year") REFERENCES "public"."vehicle_model_years"("id","generation_id","year") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vehicle_model_year_variants" ADD CONSTRAINT "vehicle_model_year_variants_variant_generation_year_fk" FOREIGN KEY ("variant_id","generation_id","year") REFERENCES "public"."vehicle_variants"("id","generation_id","year") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "vehicle_model_year_variants_generation_year_idx" ON "vehicle_model_year_variants" USING btree ("generation_id","year");--> statement-breakpoint
ALTER TABLE "vehicle_generations" ADD CONSTRAINT "vehicle_generations_id_model_unique" UNIQUE("id","model_id");--> statement-breakpoint
ALTER TABLE "vehicle_variants" ADD CONSTRAINT "vehicle_variants_id_generation_year_unique" UNIQUE("id","generation_id","year");--> statement-breakpoint
ALTER TABLE "vehicle_engines" ADD CONSTRAINT "vehicle_engines_id_model_unique" UNIQUE("id","model_id");--> statement-breakpoint
ALTER TABLE "vehicle_model_years" ADD CONSTRAINT "vehicle_model_years_id_generation_year_unique" UNIQUE("id","generation_id","year");--> statement-breakpoint
ALTER TABLE "vehicle_variants" ADD CONSTRAINT "vehicle_variants_year_check" CHECK (
                year >= 1886
                AND year <= 2100
            );--> statement-breakpoint
ALTER TABLE "vehicle_variants" ADD CONSTRAINT "vehicle_variants_engine_displacement_check" CHECK (
                engine_displacement_cc IS NULL
                OR engine_displacement_cc > 0
            );--> statement-breakpoint
ALTER TABLE "vehicle_variants" ADD CONSTRAINT "vehicle_variants_cylinders_check" CHECK (
                cylinders IS NULL
                OR cylinders > 0
            );--> statement-breakpoint
ALTER TABLE "vehicle_variants" ADD CONSTRAINT "vehicle_variants_horsepower_check" CHECK (
                horsepower IS NULL
                OR horsepower > 0
            );--> statement-breakpoint
ALTER TABLE "vehicle_variants" ADD CONSTRAINT "vehicle_variants_seats_check" CHECK (
                seats IS NULL
                OR seats > 0
            );--> statement-breakpoint
ALTER TABLE "vehicle_variants" ADD CONSTRAINT "vehicle_variants_doors_check" CHECK (
                doors IS NULL
                OR doors > 0
            );--> statement-breakpoint
ALTER TABLE "vehicle_engines" ADD CONSTRAINT "vehicle_engines_displacement_check" CHECK (
                displacement_cc IS NULL
                OR displacement_cc > 0
            );--> statement-breakpoint
ALTER TABLE "vehicle_engines" ADD CONSTRAINT "vehicle_engines_cylinders_check" CHECK (
                cylinders IS NULL
                OR cylinders > 0
            );--> statement-breakpoint
ALTER TABLE "vehicle_engines" ADD CONSTRAINT "vehicle_engines_horsepower_check" CHECK (
                horsepower IS NULL
                OR horsepower > 0
            );