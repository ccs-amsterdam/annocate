ALTER TABLE "managers" DROP CONSTRAINT "managers_job_id_user_uuid_pk";--> statement-breakpoint
ALTER TABLE "managers" ADD COLUMN "id" serial NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "managers_jobId_index" ON "managers" ("job_id");--> statement-breakpoint
ALTER TABLE "managers" ADD CONSTRAINT "unique_job_user" UNIQUE("job_id","user_uuid");