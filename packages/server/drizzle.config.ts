import { defineConfig } from "drizzle-kit";

// `pnpm db:generate`: writes a migration for the changes in src/db/schema
// (docs/hosting.md). The server applies migrations when it starts.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./migrations",
  casing: "snake_case",
});
