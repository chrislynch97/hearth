CREATE TABLE `import_batch` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`filename` text,
	`row_count` integer NOT NULL,
	`imported_count` integer NOT NULL,
	`skipped_count` integer NOT NULL,
	`mapping` text,
	`imported_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `spend_transaction` ADD `import_ref` text;--> statement-breakpoint
ALTER TABLE `spend_transaction` ADD `import_batch_id` text REFERENCES import_batch(id);--> statement-breakpoint
ALTER TABLE `spend_transaction` ADD `raw` text;--> statement-breakpoint
CREATE UNIQUE INDEX `spend_transaction_import_ref` ON `spend_transaction` (`import_ref`);