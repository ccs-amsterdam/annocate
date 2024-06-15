ALTER TABLE "unitsets" DROP CONSTRAINT "unitsets_layout_id_layouts_id_fk";
--> statement-breakpoint
ALTER TABLE "unitsets" DROP COLUMN IF EXISTS "layout_id";