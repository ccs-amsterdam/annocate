import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import fs from "node:fs";
import { openDb } from "./db.js";
import { seed } from "./seed.js";

const defaultPath = resolve(dirname(fileURLToPath(import.meta.url)), "../reference-db.sqlite");
const path = process.argv[2] ?? process.env.DB_PATH ?? defaultPath;

console.log(`Resetting db at ${path} ...`);
if (path !== ":memory:") for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(path + suffix, { force: true });

const db = openDb(path);
seed(db);
db.close();

console.log("Done: schema created and seeded with a demo job.");
