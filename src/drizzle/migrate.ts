import { config } from "dotenv";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";

config({ path: ".env.local" });

let sql: any;
if (process.env.NEON_DATABASE_URL) {
  // If a NEON DB is used, we need to set the SSL option to require
  sql = postgres(process.env.NEON_DATABASE_URL || "", {
    ssl: "require",
    max: 1,
  });
} else {
  sql = postgres(process.env.DATABASE_URL || "", {
    max: 1,
  });
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
