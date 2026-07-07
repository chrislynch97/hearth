CREATE TABLE `set_aside` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`group_label` text,
	`owner_id` text NOT NULL,
	`pot_id` text NOT NULL,
	`amount` integer NOT NULL,
	`recurrence` text NOT NULL,
	`note` text,
	`active` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pot_id`) REFERENCES `pot`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `expense` ADD `amount` integer;--> statement-breakpoint
ALTER TABLE `expense` ADD `funding` text DEFAULT 'pot_manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `expense` ADD `pot_id` text REFERENCES pot(id);--> statement-breakpoint
ALTER TABLE `expense` ADD `category_id` text REFERENCES category(id);--> statement-breakpoint
ALTER TABLE `reconciliation_batch` ADD `owner_id` text REFERENCES member(id);--> statement-breakpoint
ALTER TABLE `spend_transaction` ADD `settled_at_source` integer DEFAULT 0 NOT NULL;