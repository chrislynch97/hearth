CREATE TABLE `expense` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`recurrence` text NOT NULL,
	`note` text,
	`active` integer DEFAULT 1 NOT NULL,
	`due_anchor` text,
	`due_reminder_days` integer,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `expense_share` (
	`id` text PRIMARY KEY NOT NULL,
	`expense_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`amount` integer NOT NULL,
	`pot_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`expense_id`) REFERENCES `expense`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pot_id`) REFERENCES `pot`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_share_expense_owner` ON `expense_share` (`expense_id`,`owner_id`);