CREATE TABLE "savings_balance" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"goal_id" text NOT NULL,
	"as_of_date" text NOT NULL,
	"amount" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "savings_goal" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"pot_id" text NOT NULL,
	"name" text NOT NULL,
	"target_amount" integer NOT NULL,
	"target_date" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "savings_item" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"goal_id" text NOT NULL,
	"name" text NOT NULL,
	"amount" integer NOT NULL,
	"due_date" text,
	"paid_on" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "savings_balance" ADD CONSTRAINT "savings_balance_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_balance" ADD CONSTRAINT "savings_balance_goal_id_savings_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."savings_goal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goal" ADD CONSTRAINT "savings_goal_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_goal" ADD CONSTRAINT "savings_goal_pot_id_pot_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_item" ADD CONSTRAINT "savings_item_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "savings_item" ADD CONSTRAINT "savings_item_goal_id_savings_goal_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."savings_goal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "savings_balance_goal_date" ON "savings_balance" USING btree ("goal_id","as_of_date");--> statement-breakpoint
CREATE INDEX "savings_balance_household_id_idx" ON "savings_balance" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "savings_goal_pot" ON "savings_goal" USING btree ("household_id","pot_id");--> statement-breakpoint
CREATE INDEX "savings_goal_household_id_idx" ON "savings_goal" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "savings_item_household_id_idx" ON "savings_item" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "savings_item_goal_id_idx" ON "savings_item" USING btree ("goal_id");