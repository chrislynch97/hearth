CREATE TABLE "wishlist" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"short_id" text NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishlist_item" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"list_id" text,
	"name" text NOT NULL,
	"link" text,
	"price" integer,
	"priority" text DEFAULT 'normal' NOT NULL,
	"wanted_by_id" text,
	"notes" text,
	"bought_at" timestamp with time zone,
	"bought_by_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wishlist_item_tag" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"item_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wishlist" ADD CONSTRAINT "wishlist_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_item" ADD CONSTRAINT "wishlist_item_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_item" ADD CONSTRAINT "wishlist_item_list_id_wishlist_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."wishlist"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_item" ADD CONSTRAINT "wishlist_item_wanted_by_id_member_id_fk" FOREIGN KEY ("wanted_by_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_item" ADD CONSTRAINT "wishlist_item_bought_by_id_member_id_fk" FOREIGN KEY ("bought_by_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_item_tag" ADD CONSTRAINT "wishlist_item_tag_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wishlist_item_tag" ADD CONSTRAINT "wishlist_item_tag_item_id_wishlist_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."wishlist_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wishlist_short_id" ON "wishlist" USING btree ("household_id","short_id");--> statement-breakpoint
CREATE INDEX "wishlist_household_id_idx" ON "wishlist" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "wishlist_item_household_id_idx" ON "wishlist_item" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "wishlist_item_household_list_idx" ON "wishlist_item" USING btree ("household_id","list_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wishlist_item_tag_item_name" ON "wishlist_item_tag" USING btree ("item_id",lower("name"));--> statement-breakpoint
CREATE INDEX "wishlist_item_tag_household_id_idx" ON "wishlist_item_tag" USING btree ("household_id");