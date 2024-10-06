import { config } from "dotenv";
import { type InferSelectModel, type InferInsertModel, max } from "drizzle-orm";

import { neon } from "@neondatabase/serverless";
import postgres from "postgres";

import { NeonHttpDatabase, drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { PostgresJsDatabase, drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";

config({ path: ".env.local" });

function getDB() {
  const db_url = process.env.TEST_MODE ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
  if (!db_url) {
    if (process.env.TEST_MODE) {
      throw new Error("TEST_DATABASE_URL not set");
    } else {
      throw new Error("DATABASE_URL not set");
    }
  }
  const use_neon = db_url.includes("neon.tech");

  if (use_neon) {
    const queryClient = neon(db_url);
    const db = drizzleNeon(queryClient);
    return { db, queryClient };
  } else {
    const queryClient = postgres(db_url);
    const db = drizzlePostgres(queryClient);
    return { db, queryClient };
  }
}

const { db, queryClient } = getDB();
export default db;
export { queryClient };
