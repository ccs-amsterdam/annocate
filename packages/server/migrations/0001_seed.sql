-- What the schema files can't say: rate_limits is unlogged (losing it in a
-- crash only resets the counts), and the seed rows: the default plan and the
-- server's settings (one row).
ALTER TABLE "rate_limits" SET UNLOGGED;--> statement-breakpoint
INSERT INTO "plans" ("name", "limits") VALUES
  ('Default', '{"studies": 20, "unitsPerStudy": 50000, "units": 200000, "codersPerStudy": 5000, "answersPerStudy": 2000000}');--> statement-breakpoint
INSERT INTO "server_settings" ("default_plan_id") SELECT "id" FROM "plans" WHERE "name" = 'Default';
