ALTER TABLE "savings_goal" ALTER COLUMN "target_amount" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "savings_goal" ALTER COLUMN "target_date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pot" ADD COLUMN "interest_rate_bp" integer;