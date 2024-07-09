CREATE TABLE IF NOT EXISTS "annotations" (
	"jobset_id" integer NOT NULL,
	"user_id" varchar(256) NOT NULL,
	"index" integer NOT NULL,
	"unit_id" integer NOT NULL,
	"preallocate_time" timestamp,
	"annotation" jsonb NOT NULL,
	"history" jsonb NOT NULL,
	"status" text DEFAULT 'PREALLOCATED',
	"device_id" varchar(64),
	"authenticated" boolean NOT NULL,
	CONSTRAINT "annotations_jobset_id_user_id_index_pk" PRIMARY KEY("jobset_id","user_id","index")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "codebooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" varchar(256) NOT NULL,
	"created" timestamp DEFAULT now() NOT NULL,
	"codebook" jsonb NOT NULL,
	CONSTRAINT "unique_project_name" UNIQUE("project_id","name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invitations" (
	"jobset_id" integer NOT NULL,
	"id" varchar(64),
	"label" varchar(64) NOT NULL,
	"access" text NOT NULL,
	CONSTRAINT "invitations_jobset_id_id_pk" PRIMARY KEY("jobset_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_units" (
	"job_id" integer NOT NULL,
	"position" integer NOT NULL,
	"unit_id" integer NOT NULL,
	CONSTRAINT "job_units_job_id_position_pk" PRIMARY KEY("job_id","position")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" varchar(256) NOT NULL,
	"codebook_id" integer,
	"modified" timestamp DEFAULT now() NOT NULL,
	"deployed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jobset_annotator" (
	"user_id" varchar(256) NOT NULL,
	"jobset_id" integer,
	"email" varchar(256),
	"url_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"statistics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "jobset_annotator_user_id_jobset_id_pk" PRIMARY KEY("user_id","jobset_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "managers" (
	"project_id" integer NOT NULL,
	"user_uuid" uuid NOT NULL,
	"role" text DEFAULT 'manager' NOT NULL,
	CONSTRAINT "managers_project_id_user_uuid_pk" PRIMARY KEY("project_id","user_uuid")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"creator_email" varchar(256) NOT NULL,
	"name" varchar(128) NOT NULL,
	"created" timestamp DEFAULT now() NOT NULL,
	"project_config" jsonb DEFAULT '{"description":""}'::jsonb NOT NULL,
	"frozen" boolean DEFAULT false NOT NULL,
	CONSTRAINT "unique_creator_name" UNIQUE("creator_email","name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "units" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"unit_id" varchar(256) NOT NULL,
	"data" jsonb NOT NULL,
	"created" timestamp DEFAULT now() NOT NULL,
	"modified" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "units_project_external_id" UNIQUE("project_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(256) NOT NULL,
	"created" timestamp DEFAULT now() NOT NULL,
	"deactivated" boolean DEFAULT false NOT NULL,
	"role" text DEFAULT 'guest' NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "codebooks" ADD CONSTRAINT "codebooks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invitations" ADD CONSTRAINT "invitations_jobset_id_jobs_id_fk" FOREIGN KEY ("jobset_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_units" ADD CONSTRAINT "job_units_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_units" ADD CONSTRAINT "job_units_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jobs" ADD CONSTRAINT "jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jobs" ADD CONSTRAINT "jobs_codebook_id_codebooks_id_fk" FOREIGN KEY ("codebook_id") REFERENCES "public"."codebooks"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "managers" ADD CONSTRAINT "managers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "managers" ADD CONSTRAINT "managers_user_uuid_users_uuid_fk" FOREIGN KEY ("user_uuid") REFERENCES "public"."users"("uuid") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "units" ADD CONSTRAINT "units_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "annotations_unit_ids" ON "annotations" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "codebook_project_ids" ON "codebooks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unitset_units_unit_ids" ON "job_units" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unitset_units_position_idx" ON "job_units" USING btree ("position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_project_ids" ON "jobs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "managers_userId_index" ON "managers" USING btree ("user_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "units_project_idx" ON "units" USING btree ("project_id");