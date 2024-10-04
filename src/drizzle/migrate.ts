import { config } from "dotenv";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

config({ path: ".env.local" });

let sql: any;
const dbURL = process.env.TEST_MODE ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
const useNeon = dbURL?.includes("neon.tech");
if (useNeon) {
  // If a NEON DB is used, we need to set the SSL option to require
  sql = postgres(dbURL || "", {
    ssl: "require",
    max: 1,
  });
} else {
  sql = postgres(dbURL || "", {
    max: 1,
  });
}
const db = drizzle(sql);

const main = async () => {
  console.log(process.env.TEST_MODE);
  console.log(dbURL, useNeon);
  try {
    await migrate(db, { migrationsFolder: "drizzle-output" });
    console.log("Migration complete");
  } catch (error) {
    console.log(error);
  }
  process.exit(0);
};
main();
