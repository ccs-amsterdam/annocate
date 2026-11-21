CREATE TABLE "api_keys" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "api_keys_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"label" text NOT NULL,
	"key_hash" text NOT NULL,
	"prefix" text NOT NULL,
	"created" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_keys_key_hash_key" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "domain_plans" (
	"domain" text PRIMARY KEY NOT NULL,
	"plan_id" integer
);
--> statement-breakpoint
CREATE TABLE "identities" (
	"iss" text NOT NULL,
	"sub" text NOT NULL,
	"user_id" integer NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "identities_pkey" PRIMARY KEY("iss","sub")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "plans_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "plans_name_key" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "researcher_requests" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"approved" boolean
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "roles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"role" text NOT NULL,
	"study_id" integer,
	"user_id" integer,
	"email_domain" text,
	"require_email" boolean DEFAULT true NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by" text,
	CONSTRAINT "roles_role_fits_context" CHECK (("roles"."study_id" IS NULL AND "roles"."role" IN ('researcher', 'admin')) OR ("roles"."study_id" IS NOT NULL AND "roles"."role" IN ('READ', 'WRITE', 'ADMIN'))),
	CONSTRAINT "roles_admin_by_user" CHECK ("roles"."role" NOT IN ('admin', 'ADMIN') OR "roles"."user_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "server_settings" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"registration" jsonb DEFAULT '{"requests":true}'::jsonb NOT NULL,
	"default_plan_id" integer,
	"unit_bytes" integer DEFAULT 262144 NOT NULL,
	"answer_bytes" integer DEFAULT 65536 NOT NULL,
	CONSTRAINT "server_settings_one_row" CHECK ("server_settings"."id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"key_hash" text NOT NULL,
	"mfa" boolean DEFAULT false NOT NULL,
	"created" timestamp with time zone DEFAULT now() NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	"auth_time" timestamp with time zone,
	"issuer" text DEFAULT '' NOT NULL,
	CONSTRAINT "sessions_key_hash_key" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"plan_id" integer,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	"blocked_at" timestamp with time zone,
	"registered_at" timestamp with time zone,
	"email_verified" boolean,
	"has_mfa" boolean DEFAULT false NOT NULL,
	"reactivated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "deployment_versions" (
	"study_id" integer NOT NULL,
	"version" integer NOT NULL,
	"design_version_id" integer NOT NULL,
	"changes" jsonb NOT NULL,
	"client_release" text,
	"client_commit" text,
	"created" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deployment_versions_pkey" PRIMARY KEY("study_id","version")
);
--> statement-breakpoint
CREATE TABLE "deployments" (
	"study_id" integer PRIMARY KEY NOT NULL,
	"design_version_id" integer NOT NULL,
	"version" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"annotation_epoch" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"codings_basis" text,
	"updated" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "design_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"study_id" integer NOT NULL,
	"note" text,
	"items" jsonb NOT NULL,
	"session" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"units" jsonb DEFAULT '{"fields":[]}'::jsonb NOT NULL,
	"immutable" boolean DEFAULT false NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created" timestamp with time zone DEFAULT now() NOT NULL,
	"updated" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text,
	"public" jsonb
);
--> statement-breakpoint
CREATE TABLE "links" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "links_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"study_id" integer NOT NULL,
	"label" text NOT NULL,
	"secret" text NOT NULL,
	"coder" text,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"link_key" text DEFAULT '[]' NOT NULL,
	"max_uses" integer,
	"uses" integer DEFAULT 0 NOT NULL,
	"created" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"retired_at" timestamp with time zone,
	CONSTRAINT "links_secret_key" UNIQUE("secret")
);
--> statement-breakpoint
CREATE TABLE "studies" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "studies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"owner_id" integer,
	"origin" text,
	"archived" boolean DEFAULT false NOT NULL,
	"keep_sessions_open" boolean DEFAULT false NOT NULL,
	"redirect_urls" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created" timestamp with time zone DEFAULT now() NOT NULL,
	"suspended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "unit_draft" (
	"unit_id" integer NOT NULL,
	"field_id" integer NOT NULL,
	"value_id" integer NOT NULL,
	CONSTRAINT "unit_draft_pkey" PRIMARY KEY("unit_id","field_id")
);
--> statement-breakpoint
CREATE TABLE "unit_field_names" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "unit_field_names_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"study_id" integer NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "unit_field_names_study_id_name_key" UNIQUE("study_id","name")
);
--> statement-breakpoint
CREATE TABLE "unit_set_members" (
	"set_id" integer NOT NULL,
	"unit_id" integer NOT NULL,
	"position" integer,
	CONSTRAINT "unit_set_members_pkey" PRIMARY KEY("set_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE "unit_sets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "unit_sets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"study_id" integer NOT NULL,
	"live" boolean NOT NULL,
	"grp" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "unit_sets_study_id_live_grp_name_key" UNIQUE("study_id","live","grp","name")
);
--> statement-breakpoint
CREATE TABLE "unit_values" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "unit_values_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"study_id" integer NOT NULL,
	"hash" "bytea" NOT NULL,
	"value" jsonb NOT NULL,
	CONSTRAINT "unit_values_study_id_hash_key" UNIQUE("study_id","hash")
);
--> statement-breakpoint
CREATE TABLE "unit_version_fields" (
	"version_id" integer NOT NULL,
	"field_id" integer NOT NULL,
	"value_id" integer NOT NULL,
	CONSTRAINT "unit_version_fields_pkey" PRIMARY KEY("version_id","field_id")
);
--> statement-breakpoint
CREATE TABLE "unit_versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "unit_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"study_id" integer NOT NULL,
	"unit_id" integer NOT NULL,
	"from_deploy" integer NOT NULL,
	"to_deploy" integer,
	"created" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "units_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"study_id" integer NOT NULL,
	"external_id" text NOT NULL,
	"in_draft" boolean DEFAULT true NOT NULL,
	"coded" boolean DEFAULT false NOT NULL,
	CONSTRAINT "units_study_id_external_id_key" UNIQUE("study_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "annotation_values" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "annotation_values_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"study_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"unit_id" integer,
	"unit_version_id" integer,
	"design_version_id" integer,
	"device_id" integer,
	"variable" text NOT NULL,
	"value" jsonb NOT NULL,
	"timing" jsonb,
	"assigned" boolean DEFAULT false NOT NULL,
	"frozen" boolean DEFAULT false NOT NULL,
	"created" timestamp with time zone NOT NULL,
	"updated" timestamp with time zone NOT NULL,
	"retired_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "coder_sessions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "coder_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"study_id" integer NOT NULL,
	"link_id" integer,
	"email" text,
	"coder" text,
	"session" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"assignments" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created" timestamp with time zone DEFAULT now() NOT NULL,
	"ended" jsonb,
	"deletion_request" jsonb,
	"display" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_deletions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "session_deletions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"study_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"coder" text,
	"requested_at" timestamp with time zone,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_by" text,
	"answers" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_devices" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "session_devices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"study_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"key_hash" text NOT NULL,
	"device_type" text,
	"browser" text,
	"os" text,
	"created" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_devices_key_hash_key" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"study_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"coder" text,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "unit_codings" (
	"study_id" integer NOT NULL,
	"loop_key" text NOT NULL,
	"unit_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"agreement" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created" timestamp with time zone DEFAULT now() NOT NULL,
	"updated" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unit_codings_pkey" PRIMARY KEY("study_id","loop_key","unit_id","session_id")
);
--> statement-breakpoint
CREATE TABLE "unit_leases" (
	"study_id" integer NOT NULL,
	"loop_key" text NOT NULL,
	"set_name" text NOT NULL,
	"session_id" integer NOT NULL,
	"unit_id" integer NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "unit_leases_pkey" PRIMARY KEY("study_id","loop_key","set_name","session_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE "unit_serves" (
	"study_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"unit_id" integer NOT NULL,
	"unit_version_id" integer,
	"first_served" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unit_serves_pkey" PRIMARY KEY("session_id","unit_id")
);
--> statement-breakpoint
CREATE TABLE "admin_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"admin" text NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"minute" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "rate_limits_pkey" PRIMARY KEY("key","minute")
);
--> statement-breakpoint
CREATE TABLE "security_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "security_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"event" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_plans" ADD CONSTRAINT "domain_plans_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "researcher_requests" ADD CONSTRAINT "researcher_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_settings" ADD CONSTRAINT "server_settings_default_plan_id_plans_id_fk" FOREIGN KEY ("default_plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_versions" ADD CONSTRAINT "deployment_versions_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_versions" ADD CONSTRAINT "deployment_versions_design_version_id_design_versions_id_fk" FOREIGN KEY ("design_version_id") REFERENCES "public"."design_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_design_version_id_design_versions_id_fk" FOREIGN KEY ("design_version_id") REFERENCES "public"."design_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_versions" ADD CONSTRAINT "design_versions_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "studies" ADD CONSTRAINT "studies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_draft" ADD CONSTRAINT "unit_draft_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_draft" ADD CONSTRAINT "unit_draft_field_id_unit_field_names_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."unit_field_names"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_draft" ADD CONSTRAINT "unit_draft_value_id_unit_values_id_fk" FOREIGN KEY ("value_id") REFERENCES "public"."unit_values"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_field_names" ADD CONSTRAINT "unit_field_names_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_set_members" ADD CONSTRAINT "unit_set_members_set_id_unit_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."unit_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_set_members" ADD CONSTRAINT "unit_set_members_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_sets" ADD CONSTRAINT "unit_sets_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_values" ADD CONSTRAINT "unit_values_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_version_fields" ADD CONSTRAINT "unit_version_fields_version_id_unit_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."unit_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_version_fields" ADD CONSTRAINT "unit_version_fields_field_id_unit_field_names_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."unit_field_names"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_version_fields" ADD CONSTRAINT "unit_version_fields_value_id_unit_values_id_fk" FOREIGN KEY ("value_id") REFERENCES "public"."unit_values"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_versions" ADD CONSTRAINT "unit_versions_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_versions" ADD CONSTRAINT "unit_versions_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotation_values" ADD CONSTRAINT "annotation_values_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotation_values" ADD CONSTRAINT "annotation_values_session_id_coder_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."coder_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotation_values" ADD CONSTRAINT "annotation_values_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotation_values" ADD CONSTRAINT "annotation_values_unit_version_id_unit_versions_id_fk" FOREIGN KEY ("unit_version_id") REFERENCES "public"."unit_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotation_values" ADD CONSTRAINT "annotation_values_design_version_id_design_versions_id_fk" FOREIGN KEY ("design_version_id") REFERENCES "public"."design_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotation_values" ADD CONSTRAINT "annotation_values_device_id_session_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."session_devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coder_sessions" ADD CONSTRAINT "coder_sessions_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coder_sessions" ADD CONSTRAINT "coder_sessions_link_id_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_deletions" ADD CONSTRAINT "session_deletions_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_devices" ADD CONSTRAINT "session_devices_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_devices" ADD CONSTRAINT "session_devices_session_id_coder_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."coder_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_session_id_coder_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."coder_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_codings" ADD CONSTRAINT "unit_codings_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_codings" ADD CONSTRAINT "unit_codings_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_codings" ADD CONSTRAINT "unit_codings_session_id_coder_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."coder_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_leases" ADD CONSTRAINT "unit_leases_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_leases" ADD CONSTRAINT "unit_leases_session_id_coder_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."coder_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_leases" ADD CONSTRAINT "unit_leases_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_serves" ADD CONSTRAINT "unit_serves_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_serves" ADD CONSTRAINT "unit_serves_session_id_coder_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."coder_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_serves" ADD CONSTRAINT "unit_serves_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unit_serves" ADD CONSTRAINT "unit_serves_unit_version_id_unit_versions_id_fk" FOREIGN KEY ("unit_version_id") REFERENCES "public"."unit_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_log" ADD CONSTRAINT "security_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_user" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "identities_user" ON "identities" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "roles_study" ON "roles" USING btree ("study_id");--> statement-breakpoint
CREATE INDEX "roles_user" ON "roles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_user_server" ON "roles" USING btree ("user_id") WHERE "roles"."study_id" IS NULL AND "roles"."user_id" IS NOT NULL AND "roles"."email_domain" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "roles_user_study" ON "roles" USING btree ("study_id","user_id") WHERE "roles"."study_id" IS NOT NULL AND "roles"."user_id" IS NOT NULL AND "roles"."email_domain" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "roles_domain_server" ON "roles" USING btree ("email_domain") WHERE "roles"."study_id" IS NULL AND "roles"."user_id" IS NULL AND "roles"."email_domain" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "roles_everyone_server" ON "roles" USING btree ("role") WHERE "roles"."study_id" IS NULL AND "roles"."user_id" IS NULL AND "roles"."email_domain" IS NULL;--> statement-breakpoint
CREATE INDEX "sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_shadow_email" ON "users" USING btree ("email") WHERE "users"."registered_at" IS NULL;--> statement-breakpoint
CREATE INDEX "design_versions_study" ON "design_versions" USING btree ("study_id");--> statement-breakpoint
CREATE INDEX "links_study_key" ON "links" USING btree ("study_id","link_key");--> statement-breakpoint
CREATE INDEX "unit_draft_value" ON "unit_draft" USING btree ("value_id");--> statement-breakpoint
CREATE INDEX "unit_set_members_unit" ON "unit_set_members" USING btree ("unit_id");--> statement-breakpoint
CREATE INDEX "unit_version_fields_value" ON "unit_version_fields" USING btree ("value_id");--> statement-breakpoint
CREATE INDEX "unit_versions_current" ON "unit_versions" USING btree ("unit_id") WHERE "unit_versions"."to_deploy" IS NULL;--> statement-breakpoint
CREATE INDEX "annotation_values_coder" ON "annotation_values" USING btree ("study_id","session_id","unit_id");--> statement-breakpoint
CREATE INDEX "annotation_values_created" ON "annotation_values" USING btree ("study_id","created");--> statement-breakpoint
CREATE INDEX "annotation_values_variable" ON "annotation_values" USING btree ("study_id","variable");--> statement-breakpoint
CREATE UNIQUE INDEX "annotation_values_live" ON "annotation_values" USING btree ("unit_id","session_id","variable") WHERE "annotation_values"."retired_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "annotation_values_coder_live" ON "annotation_values" USING btree ("session_id","variable") WHERE "annotation_values"."retired_at" IS NULL AND "annotation_values"."unit_id" IS NULL;--> statement-breakpoint
CREATE INDEX "coder_sessions_email" ON "coder_sessions" USING btree ("study_id",lower("email"));--> statement-breakpoint
CREATE INDEX "coder_sessions_coder" ON "coder_sessions" USING btree ("study_id","coder");--> statement-breakpoint
CREATE INDEX "session_deletions_study" ON "session_deletions" USING btree ("study_id","deleted_at");--> statement-breakpoint
CREATE INDEX "session_devices_session" ON "session_devices" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "unit_codings_coder" ON "unit_codings" USING btree ("session_id","loop_key","created");--> statement-breakpoint
CREATE INDEX "security_log_user" ON "security_log" USING btree ("user_id","at");