import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env.local" });

function getTestDB() {
  const db_url = process.env.TEST_DATABASE_URL;
  if (!db_url) throw new Error("TEST_DATABASE_URL not set");

  const queryClient = new Pool({
    connectionString: db_url,
  });
  const db = drizzlePostgres({ client: queryClient });
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
  for (let table of tables.rows) {
    const query = sql.raw(`TRUNCATE TABLE ${table.table_name} CASCADE;`);
    await db.execute(query);
  }
  client.end();
  return "";
};

main();
