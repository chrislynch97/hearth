CREATE TABLE `income_source` (
	`id` text PRIMARY KEY NOT NULL,
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
CREATE TABLE `payslip` (
	`id` text PRIMARY KEY NOT NULL,
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
CREATE TABLE `payslip_component_type` (
	`id` text PRIMARY KEY NOT NULL,
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
CREATE TABLE `payslip_line` (
	`id` text PRIMARY KEY NOT NULL,
	`payslip_id` text NOT NULL,
	`component_id` text NOT NULL,
	`amount` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`payslip_id`) REFERENCES `payslip`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`component_id`) REFERENCES `payslip_component_type`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payslip_line_payslip_component` ON `payslip_line` (`payslip_id`,`component_id`);--> statement-breakpoint
CREATE TABLE `raise` (
	`id` text PRIMARY KEY NOT NULL,
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
