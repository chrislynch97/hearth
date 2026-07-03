ALTER TABLE `household` ADD `backup_frequency` text DEFAULT 'off' NOT NULL;--> statement-breakpoint
ALTER TABLE `household` ADD `backup_last_at` integer;