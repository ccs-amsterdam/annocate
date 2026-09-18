import { createDb } from "./schema.js";
import { seed } from "./seed.js";

const path = process.argv[2] ?? process.env.DB_PATH ?? "./mock-server.sqlite";

console.log(`Resetting db at ${path} ...`);
const fs = await import("node:fs");
if (path !== ":memory:" && fs.existsSync(path)) fs.unlinkSync(path);

const db = createDb(path);
seed(db);
db.close();

console.log("Done: schema created and seeded with a demo job.");
