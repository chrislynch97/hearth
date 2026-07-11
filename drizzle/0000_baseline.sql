CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"subtype" text,
	"owner_id" text NOT NULL,
	"institution" text,
	"note" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_balance" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"account_id" text NOT NULL,
	"as_of_date" text NOT NULL,
	"value" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"name" text NOT NULL,
	"recurrence" text NOT NULL,
	"amount" integer,
	"funding" text DEFAULT 'pot_manual' NOT NULL,
	"pot_id" text,
	"category_id" text,
	"note" text,
	"active" integer DEFAULT 1 NOT NULL,
	"due_anchor" text,
	"due_reminder_days" integer,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_share" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"expense_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"amount" integer NOT NULL,
	"pot_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household" (
	"id" text PRIMARY KEY NOT NULL,
	"display_name" text DEFAULT 'My Household' NOT NULL,
	"currency_code" text DEFAULT 'GBP' NOT NULL,
	"currency_symbol" text DEFAULT '£' NOT NULL,
	"currency_decimal_places" integer DEFAULT 2 NOT NULL,
	"currency_symbol_position" text DEFAULT 'prefix' NOT NULL,
	"currency_group_separator" text DEFAULT ',' NOT NULL,
	"currency_decimal_separator" text DEFAULT '.' NOT NULL,
	"locale" text DEFAULT 'en-GB' NOT NULL,
	"budget_period_start_day" integer DEFAULT 1 NOT NULL,
	"budget_period_frequency" text DEFAULT 'monthly' NOT NULL,
	"budget_period_anchor" text,
	"week_start" text DEFAULT 'monday' NOT NULL,
	"date_format" text DEFAULT 'medium' NOT NULL,
	"backup_frequency" text DEFAULT 'off' NOT NULL,
	"backup_last_at" timestamp with time zone,
	"setup_completed_at" timestamp with time zone,
	"income_basis_default" text DEFAULT 'regular_net' NOT NULL,
	"joint_contribution_basis" text DEFAULT 'equal' NOT NULL,
	"emergency_fund_months" integer DEFAULT 3 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"source" text NOT NULL,
	"filename" text,
	"row_count" integer NOT NULL,
	"imported_count" integer NOT NULL,
	"skipped_count" integer NOT NULL,
	"mapping" text,
	"imported_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "income_source" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"amount" integer NOT NULL,
	"basis" text DEFAULT 'net' NOT NULL,
	"recurrence" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"note" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instance_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"allow_open_registration" integer DEFAULT 0 NOT NULL,
	"owner_user_id" text,
	"auth_required" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"email" text,
	"invited_by_user_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"user_id" text,
	"kind" text NOT NULL,
	"display_name" text NOT NULL,
	"short_label" text,
	"color" text,
	"joint_contribution_weight" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"household_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"invited_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payslip" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"pay_date" text NOT NULL,
	"period_label" text,
	"net_pay" integer,
	"note" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payslip_component_type" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"is_variable" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payslip_line" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"payslip_id" text NOT NULL,
	"component_id" text NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pot" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"name" text NOT NULL,
	"category_id" text,
	"owner_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"note" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raise" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"effective_date" text NOT NULL,
	"new_salary" integer NOT NULL,
	"bonus" integer,
	"new_position" text,
	"note" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reconciliation_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"pot_id" text,
	"owner_id" text,
	"total_amount" integer NOT NULL,
	"transaction_count" integer NOT NULL,
	"reversed_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"active_household_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "set_aside" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"name" text NOT NULL,
	"group_label" text,
	"owner_id" text NOT NULL,
	"pot_id" text NOT NULL,
	"amount" integer NOT NULL,
	"recurrence" text NOT NULL,
	"note" text,
	"active" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spend_transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"date" text NOT NULL,
	"description" text NOT NULL,
	"amount" integer NOT NULL,
	"owner_id" text NOT NULL,
	"pot_id" text,
	"category_id" text,
	"settled_at_source" integer DEFAULT 0 NOT NULL,
	"reconciled" integer DEFAULT 0 NOT NULL,
	"reconciled_at" timestamp with time zone,
	"reconciliation_batch_id" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"import_ref" text,
	"import_batch_id" text,
	"raw" text,
	"split_group_id" text,
	"note" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"email" text,
	"display_name" text NOT NULL,
	"password_hash" text,
	"mfa_secret" text,
	"mfa_enabled_at" timestamp with time zone,
	"mfa_recovery_codes" text,
	"mfa_last_step" integer,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_username_unique" UNIQUE("username"),
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_owner_id_member_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_balance" ADD CONSTRAINT "account_balance_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_balance" ADD CONSTRAINT "account_balance_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_pot_id_pot_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense" ADD CONSTRAINT "expense_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_share" ADD CONSTRAINT "expense_share_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_share" ADD CONSTRAINT "expense_share_expense_id_expense_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expense"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_share" ADD CONSTRAINT "expense_share_owner_id_member_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_share" ADD CONSTRAINT "expense_share_pot_id_pot_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_source" ADD CONSTRAINT "income_source_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "income_source" ADD CONSTRAINT "income_source_owner_id_member_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership" ADD CONSTRAINT "membership_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip" ADD CONSTRAINT "payslip_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip" ADD CONSTRAINT "payslip_owner_id_member_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_component_type" ADD CONSTRAINT "payslip_component_type_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_component_type" ADD CONSTRAINT "payslip_component_type_owner_id_member_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_line" ADD CONSTRAINT "payslip_line_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_line" ADD CONSTRAINT "payslip_line_payslip_id_payslip_id_fk" FOREIGN KEY ("payslip_id") REFERENCES "public"."payslip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_line" ADD CONSTRAINT "payslip_line_component_id_payslip_component_type_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."payslip_component_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pot" ADD CONSTRAINT "pot_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pot" ADD CONSTRAINT "pot_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pot" ADD CONSTRAINT "pot_owner_id_member_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raise" ADD CONSTRAINT "raise_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raise" ADD CONSTRAINT "raise_owner_id_member_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_batch" ADD CONSTRAINT "reconciliation_batch_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_batch" ADD CONSTRAINT "reconciliation_batch_pot_id_pot_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_batch" ADD CONSTRAINT "reconciliation_batch_owner_id_member_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_active_household_id_household_id_fk" FOREIGN KEY ("active_household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_aside" ADD CONSTRAINT "set_aside_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_aside" ADD CONSTRAINT "set_aside_owner_id_member_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_aside" ADD CONSTRAINT "set_aside_pot_id_pot_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_transaction" ADD CONSTRAINT "spend_transaction_household_id_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."household"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_transaction" ADD CONSTRAINT "spend_transaction_owner_id_member_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_transaction" ADD CONSTRAINT "spend_transaction_pot_id_pot_id_fk" FOREIGN KEY ("pot_id") REFERENCES "public"."pot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_transaction" ADD CONSTRAINT "spend_transaction_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_transaction" ADD CONSTRAINT "spend_transaction_reconciliation_batch_id_reconciliation_batch_id_fk" FOREIGN KEY ("reconciliation_batch_id") REFERENCES "public"."reconciliation_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_transaction" ADD CONSTRAINT "spend_transaction_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_household_id_idx" ON "account" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_balance_account_date" ON "account_balance" USING btree ("account_id","as_of_date");--> statement-breakpoint
CREATE INDEX "account_balance_household_id_idx" ON "account_balance" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "category_household_id_idx" ON "category" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "expense_household_id_idx" ON "expense" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_share_expense_owner" ON "expense_share" USING btree ("expense_id","owner_id");--> statement-breakpoint
CREATE INDEX "expense_share_household_id_idx" ON "expense_share" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "import_batch_household_id_idx" ON "import_batch" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "income_source_household_id_idx" ON "income_source" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "invitation_household_id_idx" ON "invitation" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "member_household_id_idx" ON "member" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_user_household" ON "membership" USING btree ("user_id","household_id");--> statement-breakpoint
CREATE INDEX "membership_household_id_idx" ON "membership" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "payslip_household_id_idx" ON "payslip" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "payslip_component_type_household_id_idx" ON "payslip_component_type" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payslip_line_payslip_component" ON "payslip_line" USING btree ("payslip_id","component_id");--> statement-breakpoint
CREATE INDEX "payslip_line_household_id_idx" ON "payslip_line" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "pot_household_id_idx" ON "pot" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "raise_household_id_idx" ON "raise" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "reconciliation_batch_household_id_idx" ON "reconciliation_batch" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "set_aside_household_id_idx" ON "set_aside" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "spend_transaction_import_ref" ON "spend_transaction" USING btree ("household_id","import_ref");--> statement-breakpoint
CREATE INDEX "spend_transaction_household_id_idx" ON "spend_transaction" USING btree ("household_id");