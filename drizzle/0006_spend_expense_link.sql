-- Link a spend to the bill it paid (issue #67), so cost history is a query over
-- real payments. Nullable: most spends aren't bills, and every existing row
-- predates this. `ON DELETE set null` — deleting a bill must not erase the
-- payment history that proves what was actually paid.
ALTER TABLE "spend_transaction" ADD COLUMN "expense_id" text;--> statement-breakpoint
ALTER TABLE "spend_transaction" ADD CONSTRAINT "spend_transaction_expense_id_expense_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expense"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "spend_transaction_household_expense_idx" ON "spend_transaction" USING btree ("household_id","expense_id");