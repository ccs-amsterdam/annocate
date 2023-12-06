CREATE TABLE IF NOT EXISTS "annotations" (
	"jobset_id" integer NOT NULL,
	"user_id" varchar(256) NOT NULL,
	"index" integer NOT NULL,
	"unit_id" integer NOT NULL,
	"preallocate_time" timestamp,
	"annotation" jsonb NOT NULL,
	"history" jsonb NOT NULL,
	"status" text,
	"device_id" varchar(64),
	CONSTRAINT annotations_jobset_id_user_id_index_pk PRIMARY KEY("jobset_id","user_id","index")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invited_users" (
	"user_id" varchar(256) NOT NULL,
	"jobset_id" integer,
	"statistics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT invited_users_user_id_jobset_id_pk PRIMARY KEY("user_id","jobset_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "codebooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"name" varchar(256) NOT NULL,
	"codebook" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invitations" (
	"jobset_id" integer NOT NULL,
	"id" varchar(64),
	"label" varchar(64) NOT NULL,
	"access" text NOT NULL,
	CONSTRAINT invitations_jobset_id_id_pk PRIMARY KEY("jobset_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "job_set_unit_groups" (
	"job_set_id" integer NOT NULL,
	"unit_group_id" integer NOT NULL,
	CONSTRAINT job_set_unit_groups_job_set_id_unit_group_id_pk PRIMARY KEY("job_set_id","unit_group_id")
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
	"name" varchar(128) NOT NULL,
	"created" timestamp DEFAULT now() NOT NULL,
	"job" jsonb DEFAULT '{"description":""}'::jsonb NOT NULL,
	"frozen" boolean DEFAULT false NOT NULL,
	CONSTRAINT "jobs_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "managers" (
	"job_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT managers_job_id_user_id_pk PRIMARY KEY("job_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "annotators" (
	"job_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"job_set_id" integer NOT NULL,
	CONSTRAINT annotators_job_id_user_id_pk PRIMARY KEY("job_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "unit_group_units" (
	"unit_group_id" integer NOT NULL,
	"unit_id" integer NOT NULL,
	CONSTRAINT unit_group_units_unit_group_id_unit_id_pk PRIMARY KEY("unit_group_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "unit_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"name" varchar(256) NOT NULL,
	"rules" jsonb NOT NULL,
	"codebook_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "units" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"unit_id" varchar(256) NOT NULL,
	"created" timestamp DEFAULT now() NOT NULL,
	"unit" jsonb NOT NULL,
	"codebook_id" integer,
	"encryption_key" varchar(256),
	"modified" timestamp DEFAULT now() NOT NULL,
	"type" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(256) NOT NULL,
	"email" varchar(256) NOT NULL,
	"created" timestamp DEFAULT now() NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"can_create_job" boolean DEFAULT false NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unit_ids" ON "annotations" ("unit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_ids" ON "codebooks" ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_ids" ON "job_sets" ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_ids" ON "unit_groups" ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_ids" ON "units" ("job_id");--> statement-breakpoint
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
 ALTER TABLE "managers" ADD CONSTRAINT "managers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "annotators" ADD CONSTRAINT "annotators_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "annotators" ADD CONSTRAINT "annotators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "annotators" ADD CONSTRAINT "annotators_job_set_id_job_sets_id_fk" FOREIGN KEY ("job_set_id") REFERENCES "job_sets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "unit_group_units" ADD CONSTRAINT "unit_group_units_unit_group_id_unit_groups_id_fk" FOREIGN KEY ("unit_group_id") REFERENCES "unit_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "unit_group_units" ADD CONSTRAINT "unit_group_units_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE cascade ON UPDATE no action;
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
