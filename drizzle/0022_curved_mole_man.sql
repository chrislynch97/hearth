PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_account` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`subtype` text,
	`owner_id` text NOT NULL,
	`institution` text,
	`note` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_account`("id", "household_id", "name", "kind", "subtype", "owner_id", "institution", "note", "sort_order", "archived_at", "created_at", "updated_at") SELECT "id", "household_id", "name", "kind", "subtype", "owner_id", "institution", "note", "sort_order", "archived_at", "created_at", "updated_at" FROM `account`;--> statement-breakpoint
DROP TABLE `account`;--> statement-breakpoint
ALTER TABLE `__new_account` RENAME TO `account`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_account_balance` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`account_id` text NOT NULL,
	`as_of_date` text NOT NULL,
	`value` integer NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_account_balance`("id", "household_id", "account_id", "as_of_date", "value", "note", "created_at", "updated_at") SELECT "id", "household_id", "account_id", "as_of_date", "value", "note", "created_at", "updated_at" FROM `account_balance`;--> statement-breakpoint
DROP TABLE `account_balance`;--> statement-breakpoint
ALTER TABLE `__new_account_balance` RENAME TO `account_balance`;--> statement-breakpoint
CREATE UNIQUE INDEX `account_balance_account_date` ON `account_balance` (`account_id`,`as_of_date`);--> statement-breakpoint
CREATE TABLE `__new_category` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_category`("id", "household_id", "name", "sort_order", "archived_at", "created_at", "updated_at") SELECT "id", "household_id", "name", "sort_order", "archived_at", "created_at", "updated_at" FROM `category`;--> statement-breakpoint
DROP TABLE `category`;--> statement-breakpoint
ALTER TABLE `__new_category` RENAME TO `category`;--> statement-breakpoint
CREATE TABLE `__new_expense` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`recurrence` text NOT NULL,
	`amount` integer,
	`funding` text DEFAULT 'pot_manual' NOT NULL,
	`pot_id` text,
	`category_id` text,
	`note` text,
	`active` integer DEFAULT 1 NOT NULL,
	`due_anchor` text,
	`due_reminder_days` integer,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`pot_id`) REFERENCES `pot`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_expense`("id", "household_id", "name", "recurrence", "amount", "funding", "pot_id", "category_id", "note", "active", "due_anchor", "due_reminder_days", "archived_at", "created_at", "updated_at") SELECT "id", "household_id", "name", "recurrence", "amount", "funding", "pot_id", "category_id", "note", "active", "due_anchor", "due_reminder_days", "archived_at", "created_at", "updated_at" FROM `expense`;--> statement-breakpoint
DROP TABLE `expense`;--> statement-breakpoint
ALTER TABLE `__new_expense` RENAME TO `expense`;--> statement-breakpoint
CREATE TABLE `__new_expense_share` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`expense_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`amount` integer NOT NULL,
	`pot_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`expense_id`) REFERENCES `expense`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pot_id`) REFERENCES `pot`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_expense_share`("id", "household_id", "expense_id", "owner_id", "amount", "pot_id", "created_at", "updated_at") SELECT "id", "household_id", "expense_id", "owner_id", "amount", "pot_id", "created_at", "updated_at" FROM `expense_share`;--> statement-breakpoint
DROP TABLE `expense_share`;--> statement-breakpoint
ALTER TABLE `__new_expense_share` RENAME TO `expense_share`;--> statement-breakpoint
CREATE UNIQUE INDEX `expense_share_expense_owner` ON `expense_share` (`expense_id`,`owner_id`);--> statement-breakpoint
CREATE TABLE `__new_import_batch` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`source` text NOT NULL,
	`filename` text,
	`row_count` integer NOT NULL,
	`imported_count` integer NOT NULL,
	`skipped_count` integer NOT NULL,
	`mapping` text,
	`imported_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_import_batch`("id", "household_id", "source", "filename", "row_count", "imported_count", "skipped_count", "mapping", "imported_at", "created_at", "updated_at") SELECT "id", "household_id", "source", "filename", "row_count", "imported_count", "skipped_count", "mapping", "imported_at", "created_at", "updated_at" FROM `import_batch`;--> statement-breakpoint
DROP TABLE `import_batch`;--> statement-breakpoint
ALTER TABLE `__new_import_batch` RENAME TO `import_batch`;--> statement-breakpoint
CREATE TABLE `__new_income_source` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`amount` integer NOT NULL,
	`basis` text DEFAULT 'net' NOT NULL,
	`recurrence` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`note` text,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_income_source`("id", "household_id", "owner_id", "name", "amount", "basis", "recurrence", "active", "note", "archived_at", "created_at", "updated_at") SELECT "id", "household_id", "owner_id", "name", "amount", "basis", "recurrence", "active", "note", "archived_at", "created_at", "updated_at" FROM `income_source`;--> statement-breakpoint
DROP TABLE `income_source`;--> statement-breakpoint
ALTER TABLE `__new_income_source` RENAME TO `income_source`;--> statement-breakpoint
CREATE TABLE `__new_member` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`user_id` text,
	`kind` text NOT NULL,
	`display_name` text NOT NULL,
	`short_label` text,
	`color` text,
	`joint_contribution_weight` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_member`("id", "household_id", "user_id", "kind", "display_name", "short_label", "color", "joint_contribution_weight", "sort_order", "archived_at", "created_at", "updated_at") SELECT "id", "household_id", "user_id", "kind", "display_name", "short_label", "color", "joint_contribution_weight", "sort_order", "archived_at", "created_at", "updated_at" FROM `member`;--> statement-breakpoint
DROP TABLE `member`;--> statement-breakpoint
ALTER TABLE `__new_member` RENAME TO `member`;--> statement-breakpoint
CREATE TABLE `__new_payslip` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`pay_date` text NOT NULL,
	`period_label` text,
	`net_pay` integer,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_payslip`("id", "household_id", "owner_id", "pay_date", "period_label", "net_pay", "note", "created_at", "updated_at") SELECT "id", "household_id", "owner_id", "pay_date", "period_label", "net_pay", "note", "created_at", "updated_at" FROM `payslip`;--> statement-breakpoint
DROP TABLE `payslip`;--> statement-breakpoint
ALTER TABLE `__new_payslip` RENAME TO `payslip`;--> statement-breakpoint
CREATE TABLE `__new_payslip_component_type` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`is_variable` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_payslip_component_type`("id", "household_id", "owner_id", "name", "kind", "is_variable", "sort_order", "archived_at", "created_at", "updated_at") SELECT "id", "household_id", "owner_id", "name", "kind", "is_variable", "sort_order", "archived_at", "created_at", "updated_at" FROM `payslip_component_type`;--> statement-breakpoint
DROP TABLE `payslip_component_type`;--> statement-breakpoint
ALTER TABLE `__new_payslip_component_type` RENAME TO `payslip_component_type`;--> statement-breakpoint
CREATE TABLE `__new_payslip_line` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`payslip_id` text NOT NULL,
	`component_id` text NOT NULL,
	`amount` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`payslip_id`) REFERENCES `payslip`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`component_id`) REFERENCES `payslip_component_type`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_payslip_line`("id", "household_id", "payslip_id", "component_id", "amount", "created_at", "updated_at") SELECT "id", "household_id", "payslip_id", "component_id", "amount", "created_at", "updated_at" FROM `payslip_line`;--> statement-breakpoint
DROP TABLE `payslip_line`;--> statement-breakpoint
ALTER TABLE `__new_payslip_line` RENAME TO `payslip_line`;--> statement-breakpoint
CREATE UNIQUE INDEX `payslip_line_payslip_component` ON `payslip_line` (`payslip_id`,`component_id`);--> statement-breakpoint
CREATE TABLE `__new_pot` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`category_id` text,
	`owner_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`note` text,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_pot`("id", "household_id", "name", "category_id", "owner_id", "sort_order", "note", "archived_at", "created_at", "updated_at") SELECT "id", "household_id", "name", "category_id", "owner_id", "sort_order", "note", "archived_at", "created_at", "updated_at" FROM `pot`;--> statement-breakpoint
DROP TABLE `pot`;--> statement-breakpoint
ALTER TABLE `__new_pot` RENAME TO `pot`;--> statement-breakpoint
CREATE TABLE `__new_raise` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`effective_date` text NOT NULL,
	`new_salary` integer NOT NULL,
	`bonus` integer,
	`new_position` text,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_raise`("id", "household_id", "owner_id", "effective_date", "new_salary", "bonus", "new_position", "note", "created_at", "updated_at") SELECT "id", "household_id", "owner_id", "effective_date", "new_salary", "bonus", "new_position", "note", "created_at", "updated_at" FROM `raise`;--> statement-breakpoint
DROP TABLE `raise`;--> statement-breakpoint
ALTER TABLE `__new_raise` RENAME TO `raise`;--> statement-breakpoint
CREATE TABLE `__new_reconciliation_batch` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`pot_id` text,
	`owner_id` text,
	`total_amount` integer NOT NULL,
	`transaction_count` integer NOT NULL,
	`reversed_at` integer,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`pot_id`) REFERENCES `pot`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_reconciliation_batch`("id", "household_id", "pot_id", "owner_id", "total_amount", "transaction_count", "reversed_at", "note", "created_at", "updated_at") SELECT "id", "household_id", "pot_id", "owner_id", "total_amount", "transaction_count", "reversed_at", "note", "created_at", "updated_at" FROM `reconciliation_batch`;--> statement-breakpoint
DROP TABLE `reconciliation_batch`;--> statement-breakpoint
ALTER TABLE `__new_reconciliation_batch` RENAME TO `reconciliation_batch`;--> statement-breakpoint
CREATE TABLE `__new_set_aside` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`name` text NOT NULL,
	`group_label` text,
	`owner_id` text NOT NULL,
	`pot_id` text NOT NULL,
	`amount` integer NOT NULL,
	`recurrence` text NOT NULL,
	`note` text,
	`active` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pot_id`) REFERENCES `pot`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_set_aside`("id", "household_id", "name", "group_label", "owner_id", "pot_id", "amount", "recurrence", "note", "active", "sort_order", "archived_at", "created_at", "updated_at") SELECT "id", "household_id", "name", "group_label", "owner_id", "pot_id", "amount", "recurrence", "note", "active", "sort_order", "archived_at", "created_at", "updated_at" FROM `set_aside`;--> statement-breakpoint
DROP TABLE `set_aside`;--> statement-breakpoint
ALTER TABLE `__new_set_aside` RENAME TO `set_aside`;--> statement-breakpoint
CREATE TABLE `__new_spend_transaction` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`amount` integer NOT NULL,
	`owner_id` text NOT NULL,
	`pot_id` text,
	`category_id` text,
	`settled_at_source` integer DEFAULT 0 NOT NULL,
	`reconciled` integer DEFAULT 0 NOT NULL,
	`reconciled_at` integer,
	`reconciliation_batch_id` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`import_ref` text,
	`import_batch_id` text,
	`raw` text,
	`split_group_id` text,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`pot_id`) REFERENCES `pot`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reconciliation_batch_id`) REFERENCES `reconciliation_batch`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batch`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_spend_transaction`("id", "household_id", "date", "description", "amount", "owner_id", "pot_id", "category_id", "settled_at_source", "reconciled", "reconciled_at", "reconciliation_batch_id", "source", "import_ref", "import_batch_id", "raw", "split_group_id", "note", "created_at", "updated_at") SELECT "id", "household_id", "date", "description", "amount", "owner_id", "pot_id", "category_id", "settled_at_source", "reconciled", "reconciled_at", "reconciliation_batch_id", "source", "import_ref", "import_batch_id", "raw", "split_group_id", "note", "created_at", "updated_at" FROM `spend_transaction`;--> statement-breakpoint
DROP TABLE `spend_transaction`;--> statement-breakpoint
ALTER TABLE `__new_spend_transaction` RENAME TO `spend_transaction`;--> statement-breakpoint
CREATE UNIQUE INDEX `spend_transaction_import_ref` ON `spend_transaction` (`household_id`,`import_ref`);