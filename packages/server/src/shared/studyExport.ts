import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { PGlite } from "@electric-sql/pglite";
import {
  STUDY_EXPORT_FORMAT_VERSION,
  StudyExportManifestSchema,
  type StudyExportManifest,
} from "@annotinder/contracts";
import { eq, sql } from "drizzle-orm";
import { toSnakeCase } from "drizzle-orm/casing";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { migrationsFolder, rows, type Db } from "../db/index.js";
import {
  annotationValues,
  sessionDeletions,
  sessionDevices,
  coderSessions,
  deploymentVersions,
  deployments,
  designVersions,
  links,
  roles,
  studies,
  transfers,
  unitCodings,
  unitDraft,
  unitFieldNames,
  unitLeases,
  unitServes,
  unitSetMembers,
  unitSets,
  unitValues,
  unitVersionFields,
  unitVersions,
  units,
} from "../db/schema/index.js";
import { CLIENT_VERSION } from "../version.js";
import { HttpError } from "./http.js";
import { checkImportedStudy } from "./limits.js";
import type { StudyRow } from "./studies.js";

// Study exports (contracts `StudyExportManifestSchema`, docs/hosting.md
// "Moving a study"): the study's rows as the database holds them, to
// restore or move a study, coders and answers included.
//
// An export says which migration its database had reached. Importing loads
// its rows into an empty in-memory database at that migration, applies the
// newer migrations (the same ones a server applies to itself), and copies
// the result into this database in one transaction: with new ids (from the
// tables' own sequences) and the references between rows renumbered. So an
// export from an older release opens on a newer one, without code that
// reads old formats.

/** The study's tables, parents first. `coders`: coders' data, left out of an import without coders. */
const EXPORTED: { table: PgTable; coders?: true }[] = [
  { table: studies },
  { table: designVersions },
  { table: deployments },
  { table: deploymentVersions },
  { table: links },
  { table: unitFieldNames },
  { table: unitValues },
  { table: units },
  { table: unitDraft },
  { table: unitVersions },
  { table: unitVersionFields },
  { table: unitSets },
  { table: unitSetMembers },
  { table: coderSessions, coders: true },
  { table: sessionDevices, coders: true },
  { table: sessionDeletions, coders: true },
  { table: annotationValues, coders: true },
  { table: unitServes, coders: true },
];

/**
 * Tables that refer to a study but stay behind: roles (users are this
 * server's; the importer becomes the study's ADMIN), leases and transfer
 * tokens (short-lived), and the codings (derived from the answers again,
 * `deployments.codings_basis` cleared). A test checks every table that
 * refers to a study is in one of these lists.
 */
export const NOT_EXPORTED: readonly PgTable[] = [roles, unitLeases, transfers, unitCodings];
export const EXPORTED_TABLES: readonly PgTable[] = EXPORTED.map((e) => e.table);

const nameOf = (table: PgTable) => getTableConfig(table).name;
const column = (c: { name: string; keyAsName?: boolean }) => (c.keyAsName === false ? c.name : toSnakeCase(c.name));
const hasColumn = (table: PgTable, name: string) => getTableConfig(table).columns.some((c) => column(c) === name);

/** A table's references to other tables: its column, the table it refers to (by `id`). */
function references(table: PgTable): { column: string; to: string }[] {
  return getTableConfig(table).foreignKeys.map((fk) => {
    const ref = fk.reference();
    return { column: column(ref.columns[0]!), to: nameOf(ref.foreignTable) };
  });
}

/** Which rows of a table belong to the study: by `study_id`, else through the table it refers to that has one. */
function belongs(table: PgTable, studyId: number) {
  const t = sql.identifier(nameOf(table));
  if (table === studies) return sql`${t}.id = ${studyId}`;
  if (hasColumn(table, "study_id")) return sql`${t}.study_id = ${studyId}`;
  for (const fk of getTableConfig(table).foreignKeys) {
    const ref = fk.reference();
    if (hasColumn(ref.foreignTable, "study_id"))
      return sql`${t}.${sql.identifier(column(ref.columns[0]!))} IN (SELECT id FROM ${sql.identifier(nameOf(ref.foreignTable))} WHERE study_id = ${studyId})`;
  }
  throw new Error(`No way to tell which rows of ${nameOf(table)} belong to a study`);
}

interface Migration {
  idx: number;
  tag: string;
  statements: string[];
}

/** The migrations in `migrations/`, in order. */
function migrations(): Migration[] {
  const journal = JSON.parse(readFileSync(join(migrationsFolder, "meta", "_journal.json"), "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  return journal.entries.map(({ idx, tag }) => ({
    idx,
    tag,
    statements: readFileSync(join(migrationsFolder, `${tag}.sql`), "utf8")
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean),
  }));
}

/** The study as an export file (gzipped JSON lines: the manifest, then the rows). */
export async function exportStudy(db: Db, studyId: number): Promise<{ name: string; bytes: Buffer }> {
  const all = migrations();
  const last = all[all.length - 1]!;
  const lines: string[] = [];
  const tables: StudyExportManifest["tables"] = [];
  let name = "";
  for (const { table } of EXPORTED) {
    const t = sql.identifier(nameOf(table));
    const order = hasColumn(table, "id") ? sql`ORDER BY ${t}.id` : sql``;
    const found = await rows<{ r: Record<string, unknown> }>(
      db,
      sql`SELECT to_jsonb(${t}) AS r FROM ${t} WHERE ${belongs(table, studyId)} ${order}`,
    );
    for (const { r } of found) {
      // The owner is this server's user: the importer becomes the owner
      if (table === studies) {
        name = String(r.name);
        r.owner_id = null;
      }
      lines.push(JSON.stringify({ table: nameOf(table), row: r }));
    }
    tables.push({ name: nameOf(table), rows: found.length });
  }
  const manifest: StudyExportManifest = {
    format: "annotinder-study-export",
    formatVersion: STUDY_EXPORT_FORMAT_VERSION,
    client: CLIENT_VERSION,
    exportedAt: new Date(),
    migration: { idx: last.idx, tag: last.tag },
    study: { name },
    tables,
  };
  const text = [JSON.stringify(manifest), ...lines].join("\n") + "\n";
  return { name, bytes: gzipSync(Buffer.from(text, "utf8")) };
}

/** The largest export this server unpacks (below the largest string Node can hold). */
const MAX_UNPACKED_BYTES = 400 * 1024 * 1024;

const invalid = (message: string) => new HttpError(400, message, "export_invalid");

/** Reads an export file: its manifest, and its rows per table. */
function readExport(bytes: Buffer): {
  manifest: StudyExportManifest;
  rows: Map<string, Record<string, unknown>[]>;
} {
  let text: string;
  try {
    // A cap on the unpacked size: a small file can unpack to gigabytes
    text = gunzipSync(bytes, { maxOutputLength: MAX_UNPACKED_BYTES }).toString("utf8");
  } catch (e) {
    if ((e as { code?: string }).code === "ERR_BUFFER_TOO_LARGE")
      throw invalid(`This study export is too large: over ${MAX_UNPACKED_BYTES / 1024 / 1024} MB unpacked`);
    throw invalid("This isn't a study export: it can't be unpacked (a .annotinder.gz file from a study's Settings)");
  }
  const lines = text.split("\n").filter((l) => l.trim());
  let first: unknown;
  try {
    first = JSON.parse(lines[0] ?? "");
  } catch {
    throw invalid("This isn't a study export: it has no manifest");
  }
  const meta = first as { format?: unknown; formatVersion?: unknown; client?: { release?: unknown } };
  if (meta.format !== "annotinder-study-export") throw invalid("This isn't a study export");
  if (typeof meta.formatVersion === "number" && meta.formatVersion > STUDY_EXPORT_FORMAT_VERSION)
    throw invalid(
      `This export was made with a newer AnnoTinder (${String(meta.client?.release)}): update this server first`,
    );
  const parsed = StudyExportManifestSchema.safeParse(first);
  if (!parsed.success) throw invalid("This study export's manifest isn't valid");
  const byTable = new Map<string, Record<string, unknown>[]>();
  for (const line of lines.slice(1)) {
    const { table, row } = JSON.parse(line) as { table: string; row: Record<string, unknown> };
    byTable.set(table, [...(byTable.get(table) ?? []), row]);
  }
  return { manifest: parsed.data, rows: byTable };
}

/**
 * The export's rows as of this server's last migration: loaded into an
 * empty in-memory database at the export's migration, then migrated. Per
 * table of this server, its rows (tables a migration dropped are gone).
 */
async function migrateRows(
  manifest: StudyExportManifest,
  byTable: Map<string, Record<string, unknown>[]>,
): Promise<Map<string, Record<string, unknown>[]>> {
  const all = migrations();
  const at = all.find((m) => m.idx === manifest.migration.idx);
  if (!at || at.tag !== manifest.migration.tag) {
    const newer = manifest.migration.idx > all[all.length - 1]!.idx;
    throw invalid(
      newer
        ? `This export was made with a newer AnnoTinder (${manifest.client.release}): update this server first`
        : `This export comes from a database this release doesn't know (migration ${manifest.migration.tag})`,
    );
  }
  const temp = await PGlite.create();
  try {
    for (const m of all.filter((m) => m.idx <= at.idx)) for (const s of m.statements) await temp.exec(s);
    for (const { name } of manifest.tables) {
      const found = byTable.get(name) ?? [];
      for (let i = 0; i < found.length; i += 500) {
        await temp.query(
          `INSERT INTO "${name.replace(/"/g, '""')}" OVERRIDING SYSTEM VALUE SELECT * FROM jsonb_populate_recordset(null::"${name.replace(/"/g, '""')}", $1::jsonb)`,
          [JSON.stringify(found.slice(i, i + 500))],
        );
      }
    }
    for (const m of all.filter((m) => m.idx > at.idx)) for (const s of m.statements) await temp.exec(s);
    const result = new Map<string, Record<string, unknown>[]>();
    for (const { table } of EXPORTED) {
      const name = nameOf(table);
      const order = hasColumn(table, "id") ? ` ORDER BY id` : "";
      const { rows: found } = await temp.query<{ r: Record<string, unknown> }>(
        `SELECT to_jsonb(t) AS r FROM "${name}" t${order}`,
      );
      result.set(
        name,
        found.map((f) => f.r),
      );
    }
    return result;
  } finally {
    await temp.close();
  }
}

export interface ImportOptions {
  ownerId: number | null;
  /** The owner becomes the study's ADMIN (false: no user roles, development headers). */
  ownerIsAdmin: boolean;
  /** The new study's name (else the exported one). */
  name?: string;
  /** With coders and their answers (default yes). */
  coders?: boolean;
}

/**
 * A new study from an export, in the caller's transaction `tx`. Within the
 * importer's limits on units and coders; the caller checks the number of
 * studies.
 */
export async function importStudy(tx: Db, bytes: Buffer, options: ImportOptions): Promise<StudyRow> {
  const { manifest, rows: exported } = readExport(bytes);
  const current = await migrateRows(manifest, exported);
  const withCoders = options.coders ?? true;
  if ((current.get("studies") ?? []).length !== 1) throw invalid("This study export has no study");

  /** Per table, old id -> new id. */
  const ids = new Map<string, Map<number, number>>();
  for (const { table, coders: codersData } of EXPORTED) {
    const name = nameOf(table);
    if (codersData && !withCoders) continue;
    const found = current.get(name) ?? [];
    if (found.length === 0) continue;

    // New ids from the table's own sequence
    if (hasColumn(table, "id")) {
      const made = await rows<{ id: number | string }>(
        tx,
        sql`SELECT nextval(pg_get_serial_sequence(${name}, 'id')) AS id FROM generate_series(1, ${found.length})`,
      );
      ids.set(name, new Map(found.map((r, i) => [Number(r.id), Number(made[i]!.id)])));
    }
    const mine = ids.get(name);
    const refs = references(table);
    const copied = found.map((original) => {
      const r = { ...original };
      if (mine) r.id = mine.get(Number(original.id));
      for (const ref of refs) {
        const value = r[ref.column];
        if (value === null || value === undefined) continue;
        const to = ids.get(ref.to);
        const renumbered = to?.get(Number(value));
        if (renumbered === undefined) {
          // A reference to a table this server keeps to itself (e.g. its users): none
          if (!EXPORTED.some((e) => nameOf(e.table) === ref.to)) r[ref.column] = null;
          else throw invalid(`A row of ${name} refers to a ${ref.to} row the export doesn't have`);
        } else r[ref.column] = renumbered;
      }
      return transform(name, r, { options, ids, withCoders });
    });
    for (let i = 0; i < copied.length; i += 500) {
      const t = sql.identifier(name);
      await tx.execute(
        sql`INSERT INTO ${t} OVERRIDING SYSTEM VALUE SELECT * FROM jsonb_populate_recordset(null::${t}, ${JSON.stringify(copied.slice(i, i + 500))}::jsonb)`,
      );
    }
  }

  const studyId = [...ids.get("studies")!.values()][0]!;
  if (options.ownerId !== null && options.ownerIsAdmin)
    await tx.insert(roles).values({ role: "ADMIN", studyId, userId: options.ownerId });
  await checkImportedStudy(tx, studyId);
  const [study] = await tx.select().from(studies).where(eq(studies.id, studyId));
  return study!;
}

/** What changes for a row when it moves: the owner, secrets, and ids inside JSON. */
function transform(
  table: string,
  r: Record<string, unknown>,
  { options, ids, withCoders }: { options: ImportOptions; ids: Map<string, Map<number, number>>; withCoders: boolean },
): Record<string, unknown> {
  switch (table) {
    case "studies":
      return {
        ...r,
        owner_id: options.ownerId,
        name: options.name?.trim() || r.name,
        suspended_at: null,
      };
    case "links":
      // Links are this server's: new secrets (and no coders yet, without them)
      return { ...r, secret: randomBytes(16).toString("hex"), ...(withCoders ? {} : { uses: 0 }) };
    case "deployments":
      // The codings are derived from the answers again
      return { ...r, codings_basis: null };
    case "session_devices":
      // A device's key is a hash of its cookie: the browsers are on the old server
      return { ...r, key_hash: createHash("sha256").update(randomBytes(32)).digest("hex") };
    case "coder_sessions": {
      const ended = r.ended as { unit?: { loop: string; id: number } } | null;
      const unitId = ended?.unit ? ids.get("units")?.get(ended.unit.id) : undefined;
      return ended?.unit ? { ...r, ended: { ...ended, unit: unitId ? { ...ended.unit, id: unitId } : undefined } } : r;
    }
    default:
      return r;
  }
}
