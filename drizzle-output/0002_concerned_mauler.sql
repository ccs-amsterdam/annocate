ALTER TABLE "job_blocks" DROP CONSTRAINT "job_blocks_parent_id_job_blocks_id_fk";
--> statement-breakpoint
ALTER TABLE "job_blocks" ADD COLUMN "group" varchar(128);--> statement-breakpoint
ALTER TABLE "job_blocks" DROP COLUMN "parent_id";