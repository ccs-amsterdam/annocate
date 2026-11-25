import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { finished } from "node:stream/promises";
import { StringDecoder } from "node:string_decoder";
import { createGunzip, createGzip } from "node:zlib";
import { PGlite } from "@electric-sql/pglite";
import {
  DesignWriteSchema,
  loginRequired,
  STUDY_EXPORT_FORMAT_VERSION,
  StudyExportManifestSchema,
  StudyWriteSchema,
  deployErrors,
  sessionItem,
  undeclaredFields,
  type StudyExportManifest,
} from "@annotinder/contracts";
import { eq, sql, type SQL } from "drizzle-orm";
import { toSnakeCase } from "drizzle-orm/casing";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { migrationsFolder, rows, withoutTimeLimits, type Db } from "../db/index.js";
import { newPublicId } from "../db/publicId.js";
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
import { effectiveLimits, getSettings, usage } from "./accounts.js";
import { designVersionItems, designVersionUnits, itemsValid, type DesignVersionRow } from "./designVersions.js";
import { HttpError, type RequestIssue } from "./http.js";
import { randomToken, sha256Hex } from "./crypto.js";
import { deployedSession } from "./links.js";
import type { StudyRow } from "./studies.js";

// Study exports (contracts `StudyExportManifestSchema`, docs/hosting.md
// "Moving a study"): the study's rows as the database holds them, to
// restore or move a study, coders and answers included.
//
// An export says which migration its database had reached. Importing loads
// its rows into an empty in-memory database at that migration, applies the
// newer migrations (the same ones a server applies to itself), checks the
// result as a save and a deploy would, and copies it into this database in
// one transaction: with new ids (from the tables' own sequences) and the
// references between rows renumbered. So an export from an older release
// opens on a newer one, without code that reads old formats.

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

/** A row as the database gives it (`to_jsonb`): column -> value. */
type Row = Record<string, unknown>;
/** Rows per table name. */
type Rows = Map<string, Row[]>;

/** How many rows the export reads from the database at a time. */
const EXPORT_PAGE_ROWS = 2000;
/** How many rows the import writes at a time. */
const INSERT_ROWS = 500;

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

/** The columns of a table's primary key. */
function keyColumns(table: PgTable): string[] {
  const config = getTableConfig(table);
  const own = config.columns.filter((c) => c.primary).map(column);
  return own.length > 0 ? own : (config.primaryKeys[0]?.columns ?? []).map(column);
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

/** A study's rows of a table in the order of its primary key, a page at a time: each page starts after the last row of the one before. */
async function* pagesOf(db: Db, table: PgTable, studyId: number, pageRows: number): AsyncGenerator<Row[]> {
  const t = sql.identifier(nameOf(table));
  const key = keyColumns(table);
  const keySql = sql.join(
    key.map((k) => sql`${t}.${sql.identifier(k)}`),
    sql`, `,
  );
  let after: SQL = sql``;
  for (;;) {
    const page = await rows<{ r: Row }>(
      db,
      sql`SELECT to_jsonb(${t}) AS r FROM ${t} WHERE ${belongs(table, studyId)} ${after} ORDER BY ${keySql} LIMIT ${pageRows}`,
    );
    if (page.length > 0) yield page.map((p) => p.r);
    if (page.length < pageRows) return;
    const last = page[page.length - 1]!.r;
    const lastKey = sql.join(
      key.map((k) => sql`${last[k]}`),
      sql`, `,
    );
    after = sql`AND (${keySql}) > (${lastKey})`;
  }
}

/** A gzipped file of lines, compressed as they are written: the text is never in memory as a whole. */
function gzippedLines() {
  const gzip = createGzip();
  const chunks: Buffer[] = [];
  gzip.on("data", (chunk: Buffer) => chunks.push(chunk));
  const closed = finished(gzip);
  return {
    async write(line: string): Promise<void> {
      if (!gzip.write(line + "\n")) await once(gzip, "drain");
    },
    async end(): Promise<Buffer> {
      gzip.end();
      await closed;
      return Buffer.concat(chunks);
    },
  };
}

/**
 * The study as an export file (gzipped JSON lines: the manifest, then the
 * rows). Read in pages of `pageRows` rows and compressed along the way, in
 * one snapshot of the database: the manifest's counts are those of the rows
 * that follow, also while coders answer.
 */
export async function exportStudy(
  db: Db,
  studyId: number,
  pageRows = EXPORT_PAGE_ROWS,
): Promise<{ name: string; bytes: Buffer }> {
  const all = migrations();
  const last = all[all.length - 1]!;
  return db.transaction(
    async (tx) => {
      // A large study takes longer to read than a request's statements may
      await withoutTimeLimits(tx);
      const [study] = await tx.select({ name: studies.name }).from(studies).where(eq(studies.id, studyId));
      const tables: StudyExportManifest["tables"] = [];
      for (const { table } of EXPORTED) {
        const t = sql.identifier(nameOf(table));
        const [counted] = await rows<{ n: number }>(
          tx,
          sql`SELECT count(*)::int AS n FROM ${t} WHERE ${belongs(table, studyId)}`,
        );
        tables.push({ name: nameOf(table), rows: counted!.n });
      }
      const manifest: StudyExportManifest = {
        format: "annotinder-study-export",
        formatVersion: STUDY_EXPORT_FORMAT_VERSION,
        client: CLIENT_VERSION,
        exportedAt: new Date(),
        migration: { idx: last.idx, tag: last.tag },
        study: { name: study!.name },
        tables,
      };
      // A coder's email address goes along only where coders sign in with it (the deployed design requires it)
      const withEmail = loginRequired(await deployedSession(tx, studyId));
      const file = gzippedLines();
      await file.write(JSON.stringify(manifest));
      for (const { table } of EXPORTED) {
        for await (const page of pagesOf(tx, table, studyId, pageRows)) {
          for (const row of page) {
            // The owner is this server's user: the importer becomes the owner
            if (table === studies) row.owner_id = null;
            if (table === coderSessions && !withEmail) row.email = null;
            await file.write(JSON.stringify({ table: nameOf(table), row }));
          }
        }
      }
      return { name: study!.name, bytes: await file.end() };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

/**
 * The largest export this server unpacks, in bytes of JSON lines. An import
 * holds the export's rows in memory, so this bounds what one import takes.
 */
export const MAX_UNPACKED_BYTES = 400 * 1024 * 1024;

const invalid = (message: string, issues?: RequestIssue[]) => new HttpError(400, message, "export_invalid", issues);

/**
 * The lines of a gzipped file, unpacked a piece at a time: other requests
 * are served between the pieces, and the text is never in memory as a whole.
 */
async function* unpackedLines(bytes: Buffer): AsyncGenerator<string> {
  const gunzip = createGunzip();
  gunzip.end(bytes);
  const pieces = gunzip[Symbol.asyncIterator]() as AsyncIterator<Buffer>;
  const decoder = new StringDecoder("utf8");
  let unpacked = 0;
  let rest = "";
  for (;;) {
    let piece: IteratorResult<Buffer>;
    try {
      piece = await pieces.next();
    } catch {
      throw invalid("This isn't a study export: it can't be unpacked (a .annotinder.gz file from a study's Settings)");
    }
    if (piece.done) break;
    unpacked += piece.value.length;
    // A cap on the unpacked size: a small file can unpack to gigabytes
    if (unpacked > MAX_UNPACKED_BYTES) {
      gunzip.destroy();
      throw invalid(
        `This study export is too large: over ${MAX_UNPACKED_BYTES / 1024 / 1024} MB unpacked, the most this server imports`,
      );
    }
    const lines = (rest + decoder.write(piece.value)).split("\n");
    rest = lines.pop()!;
    yield* lines;
  }
  yield rest + decoder.end();
}

/** Reads an export file: its manifest, and its rows per table. */
async function readExport(bytes: Buffer): Promise<{ manifest: StudyExportManifest; rows: Rows }> {
  let manifest: StudyExportManifest | undefined;
  const byTable: Rows = new Map();
  for await (const line of unpackedLines(bytes)) {
    if (!line.trim()) continue;
    if (!manifest) {
      manifest = readManifest(line);
      continue;
    }
    const { table, row } = readRow(line);
    const list = byTable.get(table);
    if (list) list.push(row);
    else byTable.set(table, [row]);
  }
  if (!manifest) throw invalid("This isn't a study export: it has no manifest");
  return { manifest, rows: byTable };
}

/** An export's first line: its manifest. */
function readManifest(line: string): StudyExportManifest {
  let first: unknown;
  try {
    first = JSON.parse(line);
  } catch {
    throw invalid("This isn't a study export: it has no manifest");
  }
  const meta = (first ?? {}) as { format?: unknown; formatVersion?: unknown; client?: { release?: unknown } };
  if (meta.format !== "annotinder-study-export") throw invalid("This isn't a study export");
  if (typeof meta.formatVersion === "number" && meta.formatVersion > STUDY_EXPORT_FORMAT_VERSION)
    throw invalid(
      `This export was made with a newer AnnoTinder (${String(meta.client?.release)}): update this server first`,
    );
  const parsed = StudyExportManifestSchema.safeParse(first);
  if (!parsed.success) throw invalid("This study export's manifest isn't valid");
  return parsed.data;
}

/** A line after the manifest: a row of a table. */
function readRow(line: string): { table: string; row: Row } {
  let read: unknown;
  try {
    read = JSON.parse(line);
  } catch {
    read = null;
  }
  const { table, row } = (read ?? {}) as { table?: unknown; row?: unknown };
  if (typeof table !== "string" || row === null || typeof row !== "object" || Array.isArray(row))
    throw invalid("This study export is damaged: a line isn't a row of a table");
  return { table, row: row as Row };
}

/**
 * The export's rows as of this server's last migration: loaded into an
 * empty in-memory database at the export's migration, then migrated. Per
 * table of this server, its rows (tables a migration dropped are gone).
 * Rows that don't fit their table (a missing value, a wrong type) are
 * refused here, before this server's database is touched.
 */
async function migrateRows(manifest: StudyExportManifest, byTable: Rows): Promise<Rows> {
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
      const quoted = `"${name.replace(/"/g, '""')}"`;
      for (let i = 0; i < found.length; i += INSERT_ROWS) {
        try {
          await temp.query(
            `INSERT INTO ${quoted} OVERRIDING SYSTEM VALUE SELECT * FROM jsonb_populate_recordset(null::${quoted}, $1::jsonb)`,
            [JSON.stringify(found.slice(i, i + INSERT_ROWS))],
          );
        } catch (e) {
          throw invalid(`This study export is damaged: rows of ${name} don't fit the table (${(e as Error).message})`);
        }
      }
    }
    for (const m of all.filter((m) => m.idx > at.idx)) for (const s of m.statements) await temp.exec(s);
    const result: Rows = new Map();
    for (const { table } of EXPORTED) {
      const name = nameOf(table);
      const order = keyColumns(table)
        .map((k) => `"${k}"`)
        .join(", ");
      const { rows: found } = await temp.query<{ r: Row }>(
        `SELECT to_jsonb(t) AS r FROM "${name}" t ORDER BY ${order}`,
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
 * A new study from an export, in the caller's transaction `tx`. The export
 * is checked first: what it holds must pass what a save and a deploy check,
 * and fit the importer's limits. Only then are ids taken (a sequence doesn't
 * give ids back when the transaction fails) and rows written. The caller
 * checks the number of studies. A large study takes long to write: the
 * transaction's time limits are lifted.
 */
export async function importStudy(tx: Db, bytes: Buffer, options: ImportOptions): Promise<StudyRow> {
  await withoutTimeLimits(tx);
  const { manifest, rows: exported } = await readExport(bytes);
  const migrated = await migrateRows(manifest, exported);
  const withCoders = options.coders ?? true;
  /** The tables this import writes, with their rows. */
  const imported = EXPORTED.filter((e) => withCoders || !e.coders).map(({ table }) => ({
    table,
    name: nameOf(table),
    found: migrated.get(nameOf(table)) ?? [],
  }));
  const current: Rows = new Map(imported.map(({ name, found }) => [name, found]));
  const name = options.name?.trim() || undefined;

  checkStudy(current, name);
  checkDesigns(current);
  checkReferences(current);
  await checkLimits(tx, current, options.ownerId);

  /** Per table, old id -> new id. */
  const ids = new Map<string, Map<number, number>>();
  for (const { table, name: tableName, found } of imported) {
    if (found.length === 0) continue;
    // New ids from the table's own sequence
    if (hasColumn(table, "id")) {
      const made = await rows<{ id: number | string }>(
        tx,
        sql`SELECT nextval(pg_get_serial_sequence(${tableName}, 'id')) AS id FROM generate_series(1, ${found.length})`,
      );
      ids.set(tableName, new Map(found.map((r, i) => [Number(r.id), Number(made[i]!.id)])));
    }
    const mine = ids.get(tableName);
    const refs = references(table);
    const copied = found.map((original) => {
      const r = { ...original };
      if (mine) r.id = mine.get(Number(original.id));
      for (const ref of refs) {
        const value = r[ref.column];
        if (value === null || value === undefined) continue;
        // A reference to a table this server keeps to itself (e.g. its users): none
        r[ref.column] = ids.get(ref.to)?.get(Number(value)) ?? null;
      }
      return transform(tableName, r, { options: { ...options, name }, unitIds: ids.get("units"), withCoders });
    });
    const t = sql.identifier(tableName);
    for (let i = 0; i < copied.length; i += INSERT_ROWS) {
      await tx.execute(
        sql`INSERT INTO ${t} OVERRIDING SYSTEM VALUE SELECT * FROM jsonb_populate_recordset(null::${t}, ${JSON.stringify(copied.slice(i, i + INSERT_ROWS))}::jsonb)`,
      );
    }
  }

  const studyId = [...ids.get("studies")!.values()][0]!;
  if (options.ownerId !== null && options.ownerIsAdmin)
    await tx.insert(roles).values({ role: "ADMIN", studyId, userId: options.ownerId });
  const [study] = await tx.select().from(studies).where(eq(studies.id, studyId));
  return study!;
}

const issuesOf = (issues: { path: PropertyKey[]; message: string }[]): RequestIssue[] =>
  issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));

/** The export has one study, whose settings pass what changing them checks (contracts `StudyWriteSchema`). */
function checkStudy(current: Rows, name: string | undefined): void {
  const found = current.get("studies") ?? [];
  if (found.length !== 1) throw invalid("This study export has no study");
  const study = found[0]!;
  const settings = StudyWriteSchema.safeParse({
    name: name ?? study.name,
    reopenMinutes: study.reopen_minutes,
    redirectUrls: study.redirect_urls,
  });
  if (!settings.success)
    throw invalid("This study export's settings aren't valid: it can't be imported", issuesOf(settings.error.issues));
}

/**
 * Every design version passes what saving one checks (contracts
 * `DesignWriteSchema`), and the deployed one what deploying checks: coders
 * get it as soon as the import is done, and the runtime trusts a deployed
 * design. (How the design fits the units' columns with a role is not
 * checked again: those need the units in the database.)
 */
function checkDesigns(current: Rows): void {
  const versions = current.get("design_versions") ?? [];
  for (const version of versions) {
    const saved = DesignWriteSchema.safeParse({
      formatVersion: version.format_version,
      note: version.note ?? undefined,
      items: version.items,
      units: version.units,
      session: version.session,
      public: version.public,
    });
    if (!saved.success)
      throw invalid(
        "A design version in this study export isn't valid: it can't be imported",
        issuesOf(saved.error.issues),
      );
    if (sessionItem(saved.data.items))
      throw invalid("A design version in this study export has the session among its items: it can't be imported");
  }
  for (const deployment of current.get("deployments") ?? []) {
    const deployed = versions.find((v) => v.id === deployment.design_version_id) as
      Pick<DesignVersionRow, "items" | "session" | "units" | "public"> | undefined;
    // A deployment without its design version: `checkReferences` refuses it
    if (!deployed) continue;
    const items = designVersionItems(deployed);
    const errors = deployErrors(items);
    const undeclared = undeclaredFields(items, designVersionUnits(deployed).fields);
    if (errors.length > 0 || !itemsValid(items) || undeclared.length > 0)
      throw invalid("The deployed design in this study export has issues: it can't be imported", [
        ...issuesOf(errors),
        ...undeclared.map((field) => ({
          path: "units",
          message: `The design uses unit field '${field}', which it doesn't declare`,
        })),
      ]);
  }
}

/** Every reference to a row of another exported table finds that row in the export. */
function checkReferences(current: Rows): void {
  const known = new Map<string, Set<number>>();
  for (const { table } of EXPORTED) {
    const name = nameOf(table);
    const found = current.get(name);
    if (!found) continue;
    if (hasColumn(table, "id")) known.set(name, new Set(found.map((r) => Number(r.id))));
    const refs = references(table).filter((ref) => EXPORTED.some((e) => nameOf(e.table) === ref.to));
    for (const r of found) {
      for (const ref of refs) {
        const value = r[ref.column];
        if (value === null || value === undefined) continue;
        if (!known.get(ref.to)?.has(Number(value)))
          throw invalid(`A row of ${name} refers to a ${ref.to} row the export doesn't have`);
      }
    }
  }
}

const limitReached = (message: string) => new HttpError(403, message, "limit_reached");

/**
 * The export fits the importer's limits on units, coders and answers, and
 * this server's on the size of a unit's value and of an answer.
 */
async function checkLimits(tx: Db, current: Rows, ownerId: number | null): Promise<void> {
  const count = (table: string) => (current.get(table) ?? []).length;
  const { unitBytes, answerBytes } = await getSettings(tx);
  const tooLarge = (table: string, most: number) =>
    (current.get(table) ?? []).some((r) => Buffer.byteLength(JSON.stringify(r.value)) > most);
  if (tooLarge("unit_values", unitBytes))
    throw limitReached(`This study has a unit that takes more than a unit can on this server (${unitBytes} bytes)`);
  if (tooLarge("annotation_values", answerBytes))
    throw limitReached(
      `This study has an answer that takes more than an answer can on this server (${answerBytes} bytes)`,
    );

  if (ownerId === null) return;
  const limits = await effectiveLimits(tx, ownerId);
  const draftUnits = (current.get("units") ?? []).filter((u) => u.in_draft === true).length;
  if (limits.unitsPerStudy != null && draftUnits > limits.unitsPerStudy)
    throw limitReached(`A study can have at most ${limits.unitsPerStudy} units; this one has ${draftUnits}`);
  if (limits.units != null) {
    const owned = (await usage(tx, ownerId)).units;
    if (owned + draftUnits > limits.units)
      throw limitReached(
        `You can have at most ${limits.units} units in all your studies; with this one, ${owned + draftUnits}`,
      );
  }
  if (limits.codersPerStudy != null && count("coder_sessions") > limits.codersPerStudy)
    throw limitReached(
      `A study can have at most ${limits.codersPerStudy} coders; this one has ${count("coder_sessions")}`,
    );
  if (limits.answersPerStudy != null && count("annotation_values") > limits.answersPerStudy)
    throw limitReached(
      `A study can have at most ${limits.answersPerStudy} answers; this one has ${count("annotation_values")}`,
    );
}

/** What changes for a row when it moves: the owner, secrets, and unit ids inside JSON. */
function transform(
  table: string,
  r: Row,
  {
    options,
    unitIds,
    withCoders,
  }: { options: ImportOptions; unitIds: Map<number, number> | undefined; withCoders: boolean },
): Row {
  switch (table) {
    case "studies":
      return {
        ...r,
        owner_id: options.ownerId,
        // A new study here: its own coder links
        public_id: newPublicId(),
        name: options.name ?? r.name,
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
      return { ...r, key_hash: sha256Hex(randomToken()) };
    case "coder_sessions":
      return { ...r, ...sessionWithUnitIds(r, unitIds) };
    default:
      return r;
  }
}

/**
 * A coder session's JSON that names units by id, with the new ids: the
 * units a loop took from an earlier loop (`assignments[loop].units`), and
 * the unit the session ended on. A unit the export doesn't have (deleted
 * since) is left out.
 */
function sessionWithUnitIds(session: Row, unitIds: Map<number, number> | undefined): Row {
  const renumbered = (id: number) => unitIds?.get(id);
  const assignments = Object.fromEntries(
    Object.entries((session.assignments ?? {}) as Record<string, { units?: number[] }>).map(([loop, assignment]) => [
      loop,
      assignment.units
        ? { ...assignment, units: assignment.units.map(renumbered).filter((id) => id !== undefined) }
        : assignment,
    ]),
  );
  const ended = session.ended as { unit?: { loop: string; id: number } } | null;
  if (!ended?.unit) return { assignments };
  const unitId = renumbered(ended.unit.id);
  return { assignments, ended: { ...ended, unit: unitId === undefined ? undefined : { ...ended.unit, id: unitId } } };
}
