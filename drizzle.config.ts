import { config } from "dotenv";
import type { Config } from "drizzle-kit";

config({ path: ".env.local" });

const dbURL = process.env.TEST_MODE ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
export default {
  schema: "./src/drizzle/schema.ts",
  out: "./drizzle-output",
  dialect: "postgresql",
  dbCredentials: {
    url: dbURL || "",
  },
} satisfies Config;
