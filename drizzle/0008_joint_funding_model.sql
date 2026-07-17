-- Configurable joint funding model (issue #87). 'split' (the default) keeps the
-- current behaviour — joint costs divided per person by joint_contribution_basis;
-- 'pooled' has each person contribute their whole remainder into a joint pool.
ALTER TABLE "household" ADD COLUMN "joint_funding_model" text DEFAULT 'split' NOT NULL;