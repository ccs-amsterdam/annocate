ALTER TABLE "units" DROP CONSTRAINT "units_project_id_projects_id_fk";
--> statement-breakpoint
DROP INDEX "project_unit_uidx";--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_project_id_jobs_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_unit_uidx" ON "units" USING btree ("project_id","unit_id");