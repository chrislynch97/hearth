CREATE TABLE "billing_event" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"payload" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"household_id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"provider_customer_id" text,
	"provider_subscription_id" text,
	"plan" text NOT NULL,
	"status" text NOT NULL,
	"current_period_end" timestamp with time zone,
	"cancel_at" timestamp with time zone,
	"grace_until" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_event_provider_event_id" ON "billing_event" USING btree ("provider_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_provider_customer_id" ON "subscription" USING btree ("provider_customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_provider_subscription_id" ON "subscription" USING btree ("provider_subscription_id");