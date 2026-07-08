-- Migrate the legacy shared household password/MFA onto an owner user before
-- dropping the columns. Fires only on an existing install: a 'household' row
-- that has no membership yet. Fresh installs have no household row at migration
-- time (ensureSeed creates it afterwards), and installs already provisioned by
-- ensureSeed already have a membership — both make this a harmless no-op.
INSERT INTO `user` (`id`, `username`, `email`, `display_name`, `password_hash`, `mfa_secret`, `mfa_enabled_at`, `mfa_recovery_codes`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(16))), 'owner', NULL, COALESCE(h.`display_name`, 'Owner'),
  h.`password_hash`, h.`mfa_secret`, h.`mfa_enabled_at`, h.`mfa_recovery_codes`,
  CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
FROM `household` h
WHERE h.`id` = 'household'
  AND NOT EXISTS (SELECT 1 FROM `membership` m WHERE m.`household_id` = 'household');
--> statement-breakpoint
INSERT INTO `membership` (`id`, `user_id`, `household_id`, `role`, `invited_at`, `accepted_at`, `created_at`, `updated_at`)
SELECT lower(hex(randomblob(16))), u.`id`, 'household', 'owner', NULL,
  CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000, CAST(strftime('%s','now') AS INTEGER) * 1000
FROM `user` u
WHERE u.`username` = 'owner'
  AND NOT EXISTS (SELECT 1 FROM `membership` m WHERE m.`household_id` = 'household');
--> statement-breakpoint
ALTER TABLE `household` DROP COLUMN `password_hash`;--> statement-breakpoint
ALTER TABLE `household` DROP COLUMN `mfa_secret`;--> statement-breakpoint
ALTER TABLE `household` DROP COLUMN `mfa_enabled_at`;--> statement-breakpoint
ALTER TABLE `household` DROP COLUMN `mfa_recovery_codes`;
