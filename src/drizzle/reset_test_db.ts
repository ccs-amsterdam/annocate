import type { PlanetScaleDatabase } from "drizzle-orm/planetscale-serverless";
import type * as schema from "../drizzle/schema";
import { neon } from "@neondatabase/serverless";
import postgres from "postgres";
import { NeonHttpDatabase, drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { PostgresJsDatabase, drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { config } from "dotenv";

config({ path: ".env.local" });

function getTestDB() {
  const db_url = process.env.TEST_DATABASE_URL;
  if (!db_url) throw new Error("TEST_DATABASE_URL not set");

  const queryClient = postgres(db_url, { max: 1, onnotice: () => {} });
  const db = drizzlePostgres(queryClient);
  return [db, queryClient] as const;
}

const main = async () => {
  const [db, client] = getTestDB();

  const query = sql<string>`SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE';
      `;

  const tables = await db.execute(query);
  for (let table of tables) {
    const query = sql.raw(`TRUNCATE TABLE ${table.table_name} CASCADE;`);
    await db.execute(query);
  }
  client.end();
  return "";
};

main();
