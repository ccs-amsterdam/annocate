CREATE TABLE "annotations" (
	"job_block_id" integer NOT NULL,
	"annotator_id" integer NOT NULL,
	"unit_id" integer,
	"annotation" jsonb NOT NULL,
	"history" jsonb NOT NULL,
	"status" text DEFAULT 'PREALLOCATED',
	"device_id" varchar(64),
	"email" varchar(256),
	"is_overlap" boolean DEFAULT false NOT NULL,
	"is_survey" boolean DEFAULT false NOT NULL,
	CONSTRAINT "annotations_job_block_id_annotator_id_unit_id_pk" PRIMARY KEY("job_block_id","annotator_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE "annotator" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"user_id" varchar(256) NOT NULL,
	"url_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"statistics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "unique_user" UNIQUE("job_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"project_id" integer NOT NULL,
	"id" varchar(64),
	"label" varchar(64) NOT NULL,
	"job_id" integer NOT NULL,
	"access" text NOT NULL,
	CONSTRAINT "invitations_project_id_id_pk" PRIMARY KEY("project_id","id")
);
--> statement-breakpoint
CREATE TABLE "job_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"name" varchar(128) NOT NULL,
	"parent_id" integer,
	"position" double precision NOT NULL,
	"type" text NOT NULL,
	"block" jsonb NOT NULL,
	CONSTRAINT "unique_job_block_name" UNIQUE("job_id","name")
);
--> statement-breakpoint
CREATE TABLE "job_set_units" (
	"job_set_id" integer NOT NULL,
	"unit_id" integer NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "job_set_units_job_set_id_unit_id_position_pk" PRIMARY KEY("job_set_id","unit_id","position")
);
--> statement-breakpoint
CREATE TABLE "job_sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"name" varchar(128) NOT NULL,
	CONSTRAINT "jobset_job_name_unique" UNIQUE("job_id","name")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" varchar(256) NOT NULL,
	"modified" timestamp DEFAULT now() NOT NULL,
	"deployed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "unique_job_name" UNIQUE("project_id","name")
);
--> statement-breakpoint
CREATE TABLE "managers" (
	"project_id" integer NOT NULL,
	"user_uuid" uuid NOT NULL,
	"role" text DEFAULT 'manager' NOT NULL,
	CONSTRAINT "managers_project_id_user_uuid_pk" PRIMARY KEY("project_id","user_uuid")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"creator_email" varchar(256) NOT NULL,
	"name" varchar(128) NOT NULL,
	"created" timestamp DEFAULT now() NOT NULL,
	"project_config" jsonb DEFAULT '{"description":""}'::jsonb NOT NULL,
	"max_units" integer DEFAULT 20000 NOT NULL,
	"frozen" boolean DEFAULT false NOT NULL,
	"units_updated" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "unique_creator_name" UNIQUE("creator_email","name")
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"unit_id" varchar(256) NOT NULL,
	"data" jsonb NOT NULL,
	"created" timestamp DEFAULT now() NOT NULL,
	"modified" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(256) NOT NULL,
	"created" timestamp DEFAULT now() NOT NULL,
	"deactivated" boolean DEFAULT false NOT NULL,
	"role" text DEFAULT 'guest' NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_annotator_id_annotator_id_fk" FOREIGN KEY ("annotator_id") REFERENCES "public"."annotator"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotator" ADD CONSTRAINT "annotator_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_blocks" ADD CONSTRAINT "job_blocks_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_blocks" ADD CONSTRAINT "job_blocks_parent_id_job_blocks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."job_blocks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_set_units" ADD CONSTRAINT "job_set_units_job_set_id_job_sets_id_fk" FOREIGN KEY ("job_set_id") REFERENCES "public"."job_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_set_units" ADD CONSTRAINT "job_set_units_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_sets" ADD CONSTRAINT "job_sets_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managers" ADD CONSTRAINT "managers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managers" ADD CONSTRAINT "managers_user_uuid_users_uuid_fk" FOREIGN KEY ("user_uuid") REFERENCES "public"."users"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_project_id_jobs_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "annotator_project_idx" ON "annotator" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "annotator_user_idx" ON "annotator" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "job_blocks_job_id_idx" ON "job_blocks" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_sets_job_ids_idx" ON "job_sets" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "jobs_project_ids" ON "jobs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "managers_userId_index" ON "managers" USING btree ("user_uuid");--> statement-breakpoint
CREATE UNIQUE INDEX "job_unit_uidx" ON "units" USING btree ("project_id","unit_id");