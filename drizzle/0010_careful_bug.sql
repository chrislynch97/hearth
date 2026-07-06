ALTER TABLE `household` ADD `mfa_secret` text;--> statement-breakpoint
ALTER TABLE `household` ADD `mfa_enabled_at` integer;--> statement-breakpoint
ALTER TABLE `household` ADD `mfa_recovery_codes` text;