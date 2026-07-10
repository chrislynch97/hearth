ALTER TABLE `user` ADD `mfa_last_step` integer;
--> statement-breakpoint
-- Usernames are now case-insensitive: normalize existing rows to lower-case so
-- the BINARY unique index enforces case-insensitive uniqueness going forward.
UPDATE `user` SET `username` = lower(`username`);