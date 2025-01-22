ALTER TABLE "job_blocks" DROP CONSTRAINT "unique_job_block_name";--> statement-breakpoint
ALTER TABLE "job_blocks" ADD CONSTRAINT "unique_job_block_name" UNIQUE NULLS NOT DISTINCT("job_id","name");