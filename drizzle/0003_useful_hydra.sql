CREATE TABLE `reconciliation_batch` (
	`id` text PRIMARY KEY NOT NULL,
	`pot_id` text,
	`total_amount` integer NOT NULL,
	`transaction_count` integer NOT NULL,
	`reversed_at` integer,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`pot_id`) REFERENCES `pot`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `spend_transaction` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`amount` integer NOT NULL,
	`owner_id` text NOT NULL,
	`pot_id` text,
	`category_id` text,
	`reconciled` integer DEFAULT 0 NOT NULL,
	`reconciled_at` integer,
	`reconciliation_batch_id` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`split_group_id` text,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pot_id`) REFERENCES `pot`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reconciliation_batch_id`) REFERENCES `reconciliation_batch`(`id`) ON UPDATE no action ON DELETE no action
);
