import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

const dbURL = process.env.TEST_MODE ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
export default defineConfig({
  out: "./drizzle-output",
  dialect: "postgresql",
  schema: "./src/drizzle/schema.ts",
  dbCredentials: {
    url: dbURL || "",
  },
});
