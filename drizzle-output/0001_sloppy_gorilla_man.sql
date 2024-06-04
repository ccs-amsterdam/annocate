DROP TABLE "unit_presentations";--> statement-breakpoint
ALTER TABLE "units" RENAME COLUMN "unit" TO "data";--> statement-breakpoint
ALTER TABLE "units" DROP CONSTRAINT "units_unit_set_id_unit_sets_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "unitgroups_project_ids";--> statement-breakpoint
DROP INDEX IF EXISTS "units_project_ids";--> statement-breakpoint
ALTER TABLE "unit_sets" ADD COLUMN "created" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "unit_sets" ADD COLUMN "collections" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "unit_sets" ADD COLUMN "layout" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN "collection" varchar(256) NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unitsets_project_ids" ON "unit_sets" ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "units_collection_idx" ON "units" ("collection");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "units_project_idx" ON "units" ("project_id");--> statement-breakpoint
ALTER TABLE "units" DROP COLUMN IF EXISTS "unit_set_id";--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_project_collection_external_id" UNIQUE("project_id","unit_id");