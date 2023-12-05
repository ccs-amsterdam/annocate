ALTER TABLE "annotations" DROP CONSTRAINT "annotations_job_id_user_id_index";--> statement-breakpoint
ALTER TABLE "annotators" DROP CONSTRAINT "annotators_job_id_user_id";--> statement-breakpoint
ALTER TABLE "managers" DROP CONSTRAINT "managers_job_id_user_id";--> statement-breakpoint
ALTER TABLE "unit_group_units" DROP CONSTRAINT "unit_group_units_unit_group_id_unit_id";--> statement-breakpoint
ALTER TABLE "jobs" ALTER COLUMN "name" SET DATA TYPE varchar(128);--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_job_id_user_id_index_pk" PRIMARY KEY("job_id","user_id","index");--> statement-breakpoint
ALTER TABLE "annotators" ADD CONSTRAINT "annotators_job_id_user_id_pk" PRIMARY KEY("job_id","user_id");--> statement-breakpoint
ALTER TABLE "managers" ADD CONSTRAINT "managers_job_id_user_id_pk" PRIMARY KEY("job_id","user_id");--> statement-breakpoint
ALTER TABLE "unit_group_units" ADD CONSTRAINT "unit_group_units_unit_group_id_unit_id_pk" PRIMARY KEY("unit_group_id","unit_id");