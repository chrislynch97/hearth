CREATE TABLE `household` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text DEFAULT 'My Household' NOT NULL,
	`currency_code` text DEFAULT 'GBP' NOT NULL,
	`currency_symbol` text DEFAULT '£' NOT NULL,
	`currency_decimal_places` integer DEFAULT 2 NOT NULL,
	`locale` text DEFAULT 'en-GB' NOT NULL,
	`budget_period_start_day` integer DEFAULT 1 NOT NULL,
	`password_hash` text,
	`theme_preference` text DEFAULT 'system' NOT NULL,
	`setup_completed_at` integer,
	`income_basis_default` text DEFAULT 'regular_net' NOT NULL,
	`joint_contribution_basis` text DEFAULT 'equal' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `member` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`display_name` text NOT NULL,
	`short_label` text,
	`color` text,
	`joint_contribution_weight` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
