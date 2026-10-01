ALTER TABLE `holidays` ADD COLUMN `member_id` integer REFERENCES `family_members`(`id`) ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX `holidays_member_idx` ON `holidays` (`member_id`);
