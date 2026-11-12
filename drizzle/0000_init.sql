CREATE TABLE `task_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task_id` text NOT NULL,
	`status` text NOT NULL,
	`message` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`notebook_id` text NOT NULL,
	`question` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`source` text DEFAULT 'api' NOT NULL,
	`result` text,
	`error` text,
	`claimed_by` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_task_events_task_id_created_at` ON `task_events` (`task_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_tasks_status_created_at` ON `tasks` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_tasks_created_at` ON `tasks` (`created_at`);