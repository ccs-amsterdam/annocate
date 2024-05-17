ALTER TABLE "managers" DROP CONSTRAINT "unique_job_user";--> statement-breakpoint
DROP INDEX IF EXISTS "managers_jobId_index";--> statement-breakpoint
ALTER TABLE "managers" ADD CONSTRAINT "managers_job_id_user_uuid_pk" PRIMARY KEY("job_id","user_uuid");--> statement-breakpoint
ALTER TABLE "managers" DROP COLUMN IF EXISTS "id";