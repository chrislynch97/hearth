ALTER TABLE `household` ADD `budget_period_frequency` text DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE `household` ADD `budget_period_anchor` text;