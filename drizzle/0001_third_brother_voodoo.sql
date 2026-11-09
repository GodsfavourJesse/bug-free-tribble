CREATE TYPE "public"."vehicle_catalog_entity_type" AS ENUM('MAKE', 'MODEL', 'GENERATION', 'ENGINE', 'VARIANT', 'MODEL_YEAR');--> statement-breakpoint
CREATE TYPE "public"."vehicle_catalog_source_type" AS ENUM('MANUFACTURER', 'GOVERNMENT', 'TECHNICAL_DOCUMENT', 'AUTOMOTIVE_PUBLICATION', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."vehicle_catalog_verification_status" AS ENUM('PENDING', 'VERIFIED', 'DISPUTED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "vehicle_data_source_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"entity_type" "vehicle_catalog_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"verification_status" "vehicle_catalog_verification_status" DEFAULT 'PENDING' NOT NULL,
	"accessed_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"verification_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_data_source_entity_unique" UNIQUE("source_id","entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE "vehicle_data_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"url" text NOT NULL,
	"source_type" "vehicle_catalog_source_type" NOT NULL,
	"license_name" varchar(200),
	"license_url" text,
	"attribution_required" boolean DEFAULT false NOT NULL,
	"attribution_text" text,
	"reuse_notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_data_sources_name_url_unique" UNIQUE("name","url")
);
--> statement-breakpoint
CREATE TABLE "vehicle_engine_specifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"engine_id" uuid NOT NULL,
	"engine_code" varchar(100),
	"configuration" varchar(100),
	"cylinder_layout" varchar(50),
	"valves" integer,
	"valves_per_cylinder" integer,
	"valve_train" varchar(100),
	"aspiration" varchar(80),
	"fuel_system" varchar(120),
	"power_kw" integer,
	"power_rpm" integer,
	"torque_nm" integer,
	"torque_rpm" integer,
	"compression_ratio" real,
	"bore_mm" real,
	"stroke_mm" real,
	"hybrid_system" varchar(150),
	"motor_power_kw" integer,
	"battery_capacity_kwh" real,
	"electric_range_km" integer,
	"additional_specifications" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_engine_specifications_engine_id_unique" UNIQUE("engine_id"),
	CONSTRAINT "vehicle_engine_specs_power_check" CHECK (
                power_kw IS NULL OR power_kw > 0
            ),
	CONSTRAINT "vehicle_engine_specs_torque_check" CHECK (
                torque_nm IS NULL OR torque_nm > 0
            ),
	CONSTRAINT "vehicle_engine_specs_valves_check" CHECK (
                valves IS NULL OR valves > 0
            )
);
--> statement-breakpoint
CREATE TABLE "vehicle_variant_specifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"top_speed_kph" integer,
	"acceleration_0_to_100_seconds" real,
	"fuel_consumption_city_l100km" real,
	"fuel_consumption_highway_l100km" real,
	"fuel_consumption_combined_l100km" real,
	"battery_capacity_kwh" real,
	"electric_range_km" integer,
	"charging_power_kw" real,
	"curb_weight_kg" integer,
	"gross_weight_kg" integer,
	"towing_capacity_kg" integer,
	"length_mm" integer,
	"width_mm" integer,
	"height_mm" integer,
	"wheelbase_mm" integer,
	"ground_clearance_mm" integer,
	"fuel_tank_capacity_litres" real,
	"cargo_capacity_litres" integer,
	"tyre_sizes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"equipment" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"additional_specifications" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicle_variant_specifications_variant_id_unique" UNIQUE("variant_id"),
	CONSTRAINT "vehicle_variant_specs_dimensions_check" CHECK (
                (length_mm IS NULL OR length_mm > 0)
                AND (width_mm IS NULL OR width_mm > 0)
                AND (height_mm IS NULL OR height_mm > 0)
                AND (wheelbase_mm IS NULL OR wheelbase_mm > 0)
            ),
	CONSTRAINT "vehicle_variant_specs_weight_check" CHECK (
                (curb_weight_kg IS NULL OR curb_weight_kg > 0)
                AND (gross_weight_kg IS NULL OR gross_weight_kg > 0)
            ),
	CONSTRAINT "vehicle_variant_specs_range_check" CHECK (
                electric_range_km IS NULL
                OR electric_range_km >= 0
            )
);
--> statement-breakpoint
ALTER TABLE "vehicle_data_source_links" ADD CONSTRAINT "vehicle_data_source_links_source_id_vehicle_data_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."vehicle_data_sources"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vehicle_engine_specifications" ADD CONSTRAINT "vehicle_engine_specifications_engine_id_vehicle_engines_id_fk" FOREIGN KEY ("engine_id") REFERENCES "public"."vehicle_engines"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vehicle_variant_specifications" ADD CONSTRAINT "vehicle_variant_specifications_variant_id_vehicle_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."vehicle_variants"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "vehicle_data_source_entity_idx" ON "vehicle_data_source_links" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "vehicle_data_source_status_idx" ON "vehicle_data_source_links" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX "vehicle_data_source_source_idx" ON "vehicle_data_source_links" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "vehicle_data_sources_type_idx" ON "vehicle_data_sources" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "vehicle_data_sources_active_idx" ON "vehicle_data_sources" USING btree ("active");--> statement-breakpoint
CREATE INDEX "vehicle_engine_specs_engine_idx" ON "vehicle_engine_specifications" USING btree ("engine_id");--> statement-breakpoint
CREATE INDEX "vehicle_variant_specs_variant_idx" ON "vehicle_variant_specifications" USING btree ("variant_id");