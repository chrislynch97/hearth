ALTER TABLE `instance_settings` ADD `owner_user_id` text;--> statement-breakpoint
ALTER TABLE `instance_settings` ADD `auth_required` integer DEFAULT 0 NOT NULL;