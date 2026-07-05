CREATE TABLE IF NOT EXISTS `user` (
	`id` text PRIMARY KEY,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `workspace` ADD `user_id` text;--> statement-breakpoint
ALTER TABLE `project` ADD `user_id` text;--> statement-breakpoint
ALTER TABLE `permission` ADD `mode` text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE `session` ADD `user_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `user_username_idx` ON `user` (`username`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `session_user_idx` ON `session` (`user_id`);