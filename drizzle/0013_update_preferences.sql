ALTER TABLE "instance_settings" ADD COLUMN "auto_poll" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "pre_update_backup" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "auto_update" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "auto_update_time" text;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD COLUMN "update_last_applied_date" text;