ALTER TABLE "savings_goal" ADD COLUMN "short_id" text;--> statement-breakpoint
-- Backfill existing goals with six hex chars (a subset of base36). A clash within
-- one household is vanishingly unlikely at a handful of goals.
UPDATE "savings_goal" SET "short_id" = substr(md5("id" || random()::text), 1, 6);--> statement-breakpoint
ALTER TABLE "savings_goal" ALTER COLUMN "short_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "savings_goal_short_id" ON "savings_goal" USING btree ("household_id","short_id");
