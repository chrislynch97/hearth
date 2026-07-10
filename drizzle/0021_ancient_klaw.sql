DROP INDEX `spend_transaction_import_ref`;--> statement-breakpoint
CREATE UNIQUE INDEX `spend_transaction_import_ref` ON `spend_transaction` (`household_id`,`import_ref`);--> statement-breakpoint
ALTER TABLE `household` DROP COLUMN `theme_preference`;