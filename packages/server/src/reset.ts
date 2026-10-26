import fs from "node:fs";
import { openPglite } from "./db.js";
import { DEFAULT_PGLITE_DIR } from "./database.js";
import { seed } from "./seed.js";

// Recreates the local PGlite database (PGLITE_DIR, default .pglite) with a
// demo job. Never touches a Postgres server (DATABASE_URL).

const dir = process.argv[2] ?? process.env.PGLITE_DIR ?? DEFAULT_PGLITE_DIR;
console.log(`Resetting the PGlite database in ${dir} ...`);
fs.rmSync(dir, { recursive: true, force: true });
const db = await openPglite(dir);
await seed(db);
await db.close();
console.log("Done: schema created and seeded with a demo job.");
