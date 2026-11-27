ALTER TABLE "sessions" ADD COLUMN "last_active" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "step_up_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "id_token" text;--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN "expires";