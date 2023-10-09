import { config } from "dotenv";
import type { Config } from "drizzle-kit";

config({ path: ".env.local" });

export default {
  schema: "./src/drizzle/schema.ts",
  out: "./drizzle-output",
  driver: "pg",
  dbCredentials: {
    connectionString: process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "",
  },
} satisfies Config;
