ALTER TABLE "job_blocks" ADD COLUMN "parent_id" integer;--> statement-breakpoint
ALTER TABLE "job_blocks" ADD CONSTRAINT "job_blocks_parent_id_job_blocks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."job_blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_blocks" DROP COLUMN "group";