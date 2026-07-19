CREATE TABLE "rate_limit" (
	"limiter" text NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"blocked_until" timestamp with time zone,
	CONSTRAINT "rate_limit_limiter_key_pk" PRIMARY KEY("limiter","key")
);
--> statement-breakpoint
CREATE INDEX "rate_limit_sweep_idx" ON "rate_limit" USING btree ("limiter","window_start");