CREATE TABLE "gift" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"recipient_id" text NOT NULL,
	"name" text NOT NULL,
	"amount" integer NOT NULL,
	"status" text NOT NULL,
	"link" text,
	"note" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gift_occasion" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"name" text NOT NULL,
	"date" text,
	"budget" integer,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gift_recipient" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"occasion_id" text NOT NULL,
	"name" text NOT NULL,
	"budget" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gift" ADD CONSTRAINT "gift_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift" ADD CONSTRAINT "gift_recipient_id_gift_recipient_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."gift_recipient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_occasion" ADD CONSTRAINT "gift_occasion_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_recipient" ADD CONSTRAINT "gift_recipient_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_recipient" ADD CONSTRAINT "gift_recipient_occasion_id_gift_occasion_id_fk" FOREIGN KEY ("occasion_id") REFERENCES "public"."gift_occasion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gift_household_id_idx" ON "gift" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "gift_recipient_id_idx" ON "gift" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "gift_occasion_household_id_idx" ON "gift_occasion" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "gift_recipient_household_id_idx" ON "gift_recipient" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "gift_recipient_occasion_id_idx" ON "gift_recipient" USING btree ("occasion_id");