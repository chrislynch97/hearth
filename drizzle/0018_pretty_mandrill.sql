CREATE TABLE `instance_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`allow_open_registration` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
