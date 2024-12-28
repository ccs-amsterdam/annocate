CREATE TABLE "annotations" (
	"job_block_id" integer NOT NULL,
	"annotator_id" integer NOT NULL,
	"unit_id" integer,
	"index" integer,
	"annotation" jsonb NOT NULL,
	"history" jsonb NOT NULL,
	"status" text DEFAULT 'PREALLOCATED',
	"device_id" varchar(64),
	"authenticated" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "annotator" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"user_id" varchar(256) NOT NULL,
	"email" varchar(256),
	"url_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"statistics" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "codebooks" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" varchar(256) NOT NULL,
	"created" timestamp DEFAULT now() NOT NULL,
	"updated" timestamp DEFAULT now() NOT NULL,
	"codebook" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"project_id" integer NOT NULL,
	"id" varchar(64),
	"label" varchar(64) NOT NULL,
	"job_id" integer NOT NULL,
	"access" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_blocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"job_id" integer NOT NULL,
	"name" varchar(256),
	"position" double precision NOT NULL,
	"type" text NOT NULL,
	"codebook_id" integer NOT NULL,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"units" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" varchar(256) NOT NULL,
	"modified" timestamp DEFAULT now() NOT NULL,
	"deployed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "managers" (
	"project_id" integer NOT NULL,
	"user_uuid" uuid NOT NULL,
	"role" text DEFAULT 'manager' NOT NULL
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
	"units_updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"project_id" integer NOT NULL,
	"unit_id" varchar(256) NOT NULL,
	"position" integer NOT NULL,
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
ALTER TABLE "codebooks" ADD CONSTRAINT "codebooks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_blocks" ADD CONSTRAINT "job_blocks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_blocks" ADD CONSTRAINT "job_blocks_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_blocks" ADD CONSTRAINT "job_blocks_codebook_id_codebooks_id_fk" FOREIGN KEY ("codebook_id") REFERENCES "public"."codebooks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managers" ADD CONSTRAINT "managers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "managers" ADD CONSTRAINT "managers_user_uuid_users_uuid_fk" FOREIGN KEY ("user_uuid") REFERENCES "public"."users"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;