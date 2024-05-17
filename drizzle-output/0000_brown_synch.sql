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
	"job_id" integer NOT NULL,
	"name" varchar(256) NOT NULL,
	"created" timestamp DEFAULT now() NOT NULL,
	"codebook" jsonb NOT NULL,
	CONSTRAINT "unique_job_name" UNIQUE("job_id","name")
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
CREATE TABLE IF NOT EXISTS "job_set_unit_groups" (
	"job_set_id" integer NOT NULL,
	"unit_group_id" integer NOT NULL,
	"rules" jsonb NOT NULL,
	"codebook_id" integer,
	CONSTRAINT "job_set_unit_groups_job_set_id_unit_group_id_pk" PRIMARY KEY("job_set_id","unit_group_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_sets" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"name" varchar(256) NOT NULL,
	"modified" timestamp DEFAULT now() NOT NULL,
	"deployed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"creator_email" varchar(256) NOT NULL,
	"name" varchar(128) NOT NULL,
	"created" timestamp DEFAULT now() NOT NULL,
	"job" jsonb DEFAULT '{"description":""}'::jsonb NOT NULL,
	"frozen" boolean DEFAULT false NOT NULL,
	CONSTRAINT "unique_creator_name" UNIQUE("creator_email","name")
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
	"job_id" integer NOT NULL,
	"user_uuid" uuid NOT NULL,
	"role" text DEFAULT 'manager' NOT NULL,
	CONSTRAINT "managers_job_id_user_uuid_pk" PRIMARY KEY("job_id","user_uuid")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "unit_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"name" varchar(256) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "units" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"unit_group_id" integer NOT NULL,
	"unit_id" varchar(256) NOT NULL,
	"unit" jsonb NOT NULL,
	"created" timestamp DEFAULT now() NOT NULL,
	"codebook_id" integer,
	"modified" timestamp DEFAULT now() NOT NULL,
	"type" text NOT NULL
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
CREATE INDEX IF NOT EXISTS "annotations_unit_ids" ON "annotations" ("unit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "codebook_job_ids" ON "codebooks" ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobsets_job_ids" ON "job_sets" ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "managers_userId_index" ON "managers" ("user_uuid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unitgroups_job_ids" ON "unit_groups" ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "units_job_ids" ON "units" ("job_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "codebooks" ADD CONSTRAINT "codebooks_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invitations" ADD CONSTRAINT "invitations_jobset_id_job_sets_id_fk" FOREIGN KEY ("jobset_id") REFERENCES "job_sets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_set_unit_groups" ADD CONSTRAINT "job_set_unit_groups_job_set_id_job_sets_id_fk" FOREIGN KEY ("job_set_id") REFERENCES "job_sets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_set_unit_groups" ADD CONSTRAINT "job_set_unit_groups_unit_group_id_unit_groups_id_fk" FOREIGN KEY ("unit_group_id") REFERENCES "unit_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_set_unit_groups" ADD CONSTRAINT "job_set_unit_groups_codebook_id_codebooks_id_fk" FOREIGN KEY ("codebook_id") REFERENCES "codebooks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "job_sets" ADD CONSTRAINT "job_sets_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "managers" ADD CONSTRAINT "managers_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "managers" ADD CONSTRAINT "managers_user_uuid_users_uuid_fk" FOREIGN KEY ("user_uuid") REFERENCES "users"("uuid") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "unit_groups" ADD CONSTRAINT "unit_groups_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "units" ADD CONSTRAINT "units_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "units" ADD CONSTRAINT "units_unit_group_id_unit_groups_id_fk" FOREIGN KEY ("unit_group_id") REFERENCES "unit_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
