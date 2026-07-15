-- Sessions gain a sliding idle window, a hard lifetime ceiling, and enough
-- provenance for a user to review and revoke them (see issue #50).
--
-- Hand-edited from the generated migration: drizzle-kit emits the two new
-- timestamps as `NOT NULL` with no default, which cannot apply to a table that
-- already holds live sessions. Add them nullable, backfill, then tighten.
ALTER TABLE "session" ADD COLUMN "absolute_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "ip" text;--> statement-breakpoint

-- Backfill existing rows from the only facts they carry: nothing recorded
-- activity before now, so creation time is the best available "last seen", and
-- the ceiling is measured from it. A row already older than the 90-day cap lands
-- with a past absolute deadline and reads as expired — correct, not a bug.
UPDATE "session" SET "last_seen_at" = "created_at" WHERE "last_seen_at" IS NULL;--> statement-breakpoint
UPDATE "session"
  SET "absolute_expires_at" = "created_at" + interval '90 days'
  WHERE "absolute_expires_at" IS NULL;--> statement-breakpoint

ALTER TABLE "session" ALTER COLUMN "absolute_expires_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "last_seen_at" SET NOT NULL;--> statement-breakpoint

-- sessions.list and the revoke-others path both filter by user.
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");
