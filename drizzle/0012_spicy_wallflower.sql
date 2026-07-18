CREATE TABLE "standing_order_ack" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"pot_id" text NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "standing_order_ack" ADD CONSTRAINT "standing_order_ack_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standing_order_ack" ADD CONSTRAINT "standing_order_ack_pot_id_pot_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "standing_order_ack_pot" ON "standing_order_ack" USING btree ("household_id","pot_id");--> statement-breakpoint
CREATE INDEX "standing_order_ack_household_id_idx" ON "standing_order_ack" USING btree ("household_id");