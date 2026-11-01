CREATE TABLE "todo" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"list_id" text,
	"title" text NOT NULL,
	"notes" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"assignee_id" text,
	"due_date" text,
	"completed_at" timestamp with time zone,
	"completed_by_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "todo_list" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"short_id" text NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "todo_reminder" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"todo_id" text NOT NULL,
	"remind_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "todo_tag" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "todo_tag_link" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"todo_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "todo" ADD CONSTRAINT "todo_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo" ADD CONSTRAINT "todo_list_id_todo_list_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."todo_list"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo" ADD CONSTRAINT "todo_assignee_id_member_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo" ADD CONSTRAINT "todo_completed_by_id_member_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_list" ADD CONSTRAINT "todo_list_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_reminder" ADD CONSTRAINT "todo_reminder_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_reminder" ADD CONSTRAINT "todo_reminder_todo_id_todo_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_tag" ADD CONSTRAINT "todo_tag_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_tag_link" ADD CONSTRAINT "todo_tag_link_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_tag_link" ADD CONSTRAINT "todo_tag_link_todo_id_todo_id_fk" FOREIGN KEY ("todo_id") REFERENCES "public"."todo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_tag_link" ADD CONSTRAINT "todo_tag_link_tag_id_todo_tag_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."todo_tag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "todo_household_id_idx" ON "todo" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "todo_household_list_idx" ON "todo" USING btree ("household_id","list_id");--> statement-breakpoint
CREATE UNIQUE INDEX "todo_list_short_id" ON "todo_list" USING btree ("household_id","short_id");--> statement-breakpoint
CREATE INDEX "todo_list_household_id_idx" ON "todo_list" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "todo_reminder_household_id_idx" ON "todo_reminder" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "todo_reminder_todo_id_idx" ON "todo_reminder" USING btree ("todo_id");--> statement-breakpoint
CREATE INDEX "todo_reminder_due_idx" ON "todo_reminder" USING btree ("remind_at") WHERE "todo_reminder"."sent_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "todo_tag_household_name" ON "todo_tag" USING btree ("household_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "todo_tag_link_pair" ON "todo_tag_link" USING btree ("todo_id","tag_id");--> statement-breakpoint
CREATE INDEX "todo_tag_link_tag_id_idx" ON "todo_tag_link" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "todo_tag_link_household_id_idx" ON "todo_tag_link" USING btree ("household_id");