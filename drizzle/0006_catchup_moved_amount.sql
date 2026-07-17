-- Catch-up can now record the amount actually moved, not just "mark moved"
-- (issue #72). `total_amount` still means what the reconciled spends *required*;
-- `moved_amount` is what actually left the account. Nullable: NULL preserves the
-- existing rows and today's one-click behaviour, meaning "moved in full".
ALTER TABLE "reconciliation_batch" ADD COLUMN "moved_amount" integer;
