ALTER TABLE "jobs" ADD COLUMN "created" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" DROP COLUMN IF EXISTS "settings";