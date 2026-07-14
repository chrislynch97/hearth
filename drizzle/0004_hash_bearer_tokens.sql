-- Bearer credentials are now stored hashed at rest (see issue #47).

-- Sessions: rows used to be keyed by the raw cookie token; lookups now hash the
-- presented token, so every existing row is unreachable. Clear them — users
-- simply log in again (the cookie is re-issued as a fresh token).
DELETE FROM "session";--> statement-breakpoint

-- Invitations: the shareable token used to be the primary key. It now lives only
-- as its sha256 in a dedicated column, with the id demoted to an opaque
-- display/revoke identifier. Pending invites still carry the raw token in "id"
-- and can't be re-hashed here (no pgcrypto on the embedded engine), so drop them
-- to be re-issued. Accepted rows are historical and never looked up by token, so
-- backfill their hash from the old id just to satisfy NOT NULL.
DELETE FROM "invitation" WHERE "accepted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "token_hash" text;--> statement-breakpoint
UPDATE "invitation" SET "token_hash" = "id" WHERE "token_hash" IS NULL;--> statement-breakpoint
ALTER TABLE "invitation" ALTER COLUMN "token_hash" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "invitation_token_hash_idx" ON "invitation" USING btree ("token_hash");
