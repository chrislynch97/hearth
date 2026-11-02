CREATE TABLE "maintenance_job" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"name" text NOT NULL,
	"area" text DEFAULT 'other' NOT NULL,
	"notes" text,
	"assignee_id" text,
	"due_date" text NOT NULL,
	"repeat_every" integer,
	"repeat_unit" text DEFAULT 'month' NOT NULL,
	"remind_days" integer NOT NULL,
	"reminded_for" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_log" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"job_id" text NOT NULL,
	"done_on" text NOT NULL,
	"done_by_id" text,
	"amount" integer,
	"note" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "maintenance_job" ADD CONSTRAINT "maintenance_job_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_job" ADD CONSTRAINT "maintenance_job_assignee_id_member_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_log" ADD CONSTRAINT "maintenance_log_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_log" ADD CONSTRAINT "maintenance_log_job_id_maintenance_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."maintenance_job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_log" ADD CONSTRAINT "maintenance_log_done_by_id_member_id_fk" FOREIGN KEY ("done_by_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "maintenance_job_household_id_idx" ON "maintenance_job" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "maintenance_log_household_id_idx" ON "maintenance_log" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "maintenance_log_job_id_idx" ON "maintenance_log" USING btree ("job_id");