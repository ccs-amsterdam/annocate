import { config } from "dotenv";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });

let sql: any;
const dbURL = process.env.TEST_MODE ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
const useNeon = dbURL?.includes("neon.tech");

if (useNeon) {
  sql = neon(dbURL || "");
} else {
  sql = new Pool({ connectionString: dbURL || "" });
}

const db = drizzle(sql);

const main = async () => {
  try {
    await migrate(db, { migrationsFolder: "drizzle-output" });
    console.log("Migration complete");
  } catch (error) {
    console.log(error);
  }
  process.exit(0);
};
main();
