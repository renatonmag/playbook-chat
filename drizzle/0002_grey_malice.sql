CREATE TABLE `react_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`state` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
