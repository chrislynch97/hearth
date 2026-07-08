ALTER TABLE `household` ADD `currency_symbol_position` text DEFAULT 'prefix' NOT NULL;--> statement-breakpoint
ALTER TABLE `household` ADD `currency_group_separator` text DEFAULT ',' NOT NULL;--> statement-breakpoint
ALTER TABLE `household` ADD `currency_decimal_separator` text DEFAULT '.' NOT NULL;