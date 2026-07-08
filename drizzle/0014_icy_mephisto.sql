CREATE TABLE `membership` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`household_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`invited_at` integer,
	`accepted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_user_household` ON `membership` (`user_id`,`household_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`email` text,
	`display_name` text NOT NULL,
	`password_hash` text,
	`mfa_secret` text,
	`mfa_enabled_at` integer,
	`mfa_recovery_codes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
ALTER TABLE `account` ADD `household_id` text DEFAULT 'household' NOT NULL;--> statement-breakpoint
ALTER TABLE `account_balance` ADD `household_id` text DEFAULT 'household' NOT NULL;--> statement-breakpoint
ALTER TABLE `category` ADD `household_id` text DEFAULT 'household' NOT NULL;--> statement-breakpoint
ALTER TABLE `expense` ADD `household_id` text DEFAULT 'household' NOT NULL;--> statement-breakpoint
ALTER TABLE `expense_share` ADD `household_id` text DEFAULT 'household' NOT NULL;--> statement-breakpoint
ALTER TABLE `import_batch` ADD `household_id` text DEFAULT 'household' NOT NULL;--> statement-breakpoint
ALTER TABLE `income_source` ADD `household_id` text DEFAULT 'household' NOT NULL;--> statement-breakpoint
ALTER TABLE `member` ADD `household_id` text DEFAULT 'household' NOT NULL;--> statement-breakpoint
ALTER TABLE `member` ADD `user_id` text;--> statement-breakpoint
ALTER TABLE `payslip` ADD `household_id` text DEFAULT 'household' NOT NULL;--> statement-breakpoint
ALTER TABLE `payslip_component_type` ADD `household_id` text DEFAULT 'household' NOT NULL;--> statement-breakpoint
ALTER TABLE `payslip_line` ADD `household_id` text DEFAULT 'household' NOT NULL;--> statement-breakpoint
ALTER TABLE `pot` ADD `household_id` text DEFAULT 'household' NOT NULL;--> statement-breakpoint
ALTER TABLE `raise` ADD `household_id` text DEFAULT 'household' NOT NULL;--> statement-breakpoint
ALTER TABLE `reconciliation_batch` ADD `household_id` text DEFAULT 'household' NOT NULL;--> statement-breakpoint
ALTER TABLE `set_aside` ADD `household_id` text DEFAULT 'household' NOT NULL;--> statement-breakpoint
ALTER TABLE `spend_transaction` ADD `household_id` text DEFAULT 'household' NOT NULL;