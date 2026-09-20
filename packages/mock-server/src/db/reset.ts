import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import fs from "node:fs";
import { createDb } from "./schema.js";
import { seed } from "./seed.js";

const defaultPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../mock-server.sqlite");
const path = process.argv[2] ?? process.env.DB_PATH ?? defaultPath;

console.log(`Resetting db at ${path} ...`);
if (path !== ":memory:" && fs.existsSync(path)) fs.unlinkSync(path);

const db = createDb(path);
seed(db);
db.close();

console.log("Done: schema created and seeded with a demo job.");
