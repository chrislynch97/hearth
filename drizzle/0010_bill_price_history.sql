CREATE TABLE "bill_price" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"expense_id" text NOT NULL,
	"effective_date" text NOT NULL,
	"amount" integer NOT NULL,
	"note" text,
	"source" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bill_price" ADD CONSTRAINT "bill_price_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_price" ADD CONSTRAINT "bill_price_expense_id_expense_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expense"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bill_price_household_id_idx" ON "bill_price" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "bill_price_expense_id_idx" ON "bill_price" USING btree ("expense_id");