ALTER TABLE "unitset_units" ADD COLUMN "position" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unitset_units_unit_ids" ON "unitset_units" ("unit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unitset_units_position_idx" ON "unitset_units" ("position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "unitsets_project_ids" ON "unitsets" ("project_id");