CREATE TABLE "vehicle" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"short_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'car' NOT NULL,
	"registration" text,
	"owner_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_bill" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"vehicle_id" text NOT NULL,
	"expense_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_cost" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"vehicle_id" text NOT NULL,
	"kind" text NOT NULL,
	"date" text NOT NULL,
	"amount" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicle_date" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"vehicle_id" text NOT NULL,
	"kind" text NOT NULL,
	"label" text,
	"due_date" text NOT NULL,
	"repeat_months" integer,
	"remind_days" integer NOT NULL,
	"reminded_for" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_owner_id_member_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_bill" ADD CONSTRAINT "vehicle_bill_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_bill" ADD CONSTRAINT "vehicle_bill_vehicle_id_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_bill" ADD CONSTRAINT "vehicle_bill_expense_id_expense_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expense"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_cost" ADD CONSTRAINT "vehicle_cost_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_cost" ADD CONSTRAINT "vehicle_cost_vehicle_id_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_date" ADD CONSTRAINT "vehicle_date_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_date" ADD CONSTRAINT "vehicle_date_vehicle_id_vehicle_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_short_id" ON "vehicle" USING btree ("household_id","short_id");--> statement-breakpoint
CREATE INDEX "vehicle_household_id_idx" ON "vehicle" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicle_bill_expense" ON "vehicle_bill" USING btree ("expense_id");--> statement-breakpoint
CREATE INDEX "vehicle_bill_household_id_idx" ON "vehicle_bill" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "vehicle_bill_vehicle_id_idx" ON "vehicle_bill" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "vehicle_cost_household_id_idx" ON "vehicle_cost" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "vehicle_cost_vehicle_id_idx" ON "vehicle_cost" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "vehicle_date_household_id_idx" ON "vehicle_date" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "vehicle_date_vehicle_id_idx" ON "vehicle_date" USING btree ("vehicle_id");