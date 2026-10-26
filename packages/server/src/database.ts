import { fileURLToPath } from "node:url";
import { openPglite, openPostgres, type Sql } from "./db.js";

/** Where the local PGlite database lives, unless `PGLITE_DIR` says otherwise. */
export const DEFAULT_PGLITE_DIR = fileURLToPath(new URL("../.pglite", import.meta.url));

/**
 * The database from the environment: Postgres at `DATABASE_URL`, or else a
 * PGlite database in `PGLITE_DIR` (default: `.pglite` in this package).
 */
export function openDatabase(): Promise<Sql> {
  const url = process.env.DATABASE_URL;
  return url ? openPostgres(url) : openPglite(process.env.PGLITE_DIR ?? DEFAULT_PGLITE_DIR);
}

/** Where `openDatabase` connects, without credentials. */
export function describeDatabase(): string {
  const url = process.env.DATABASE_URL;
  if (!url) return `PGlite in ${process.env.PGLITE_DIR ?? DEFAULT_PGLITE_DIR}`;
  const parsed = new URL(url);
  return `Postgres at ${parsed.host}${parsed.pathname}`;
}
