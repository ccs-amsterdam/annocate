import { RESULTS_EXPORT_FORMAT_VERSION, loginRequired } from "@annotinder/contracts";
import { sha256Hex } from "./crypto.js";
import { Zip, ZipDeflate, strToU8 } from "fflate";
import { asc, eq, sql, type SQL } from "drizzle-orm";
import { RELEASE } from "@annotinder/contracts";
import { rows, withoutTimeLimits, type Db } from "../db/index.js";
import { coders, designVersions, sessionDevices, studies } from "../db/schema/index.js";
import { unitDataHash, unitVersionData } from "../db/sql.js";
import { listCoderDeletions } from "./coderDeletion.js";
import { deploymentVersions } from "./deployments.js";
import { toDesignVersion } from "./designVersions.js";
import { studyCoderKind } from "./studies.js";
import type { FileStore } from "./files.js";
import { deployedSession } from "./links.js";
import { listCoderProgress } from "./progress.js";
import { listSetGroups } from "./sets.js";

// The raw results export (docs/plans/exports-and-files.md): a zip of
// JSON-lines files, one per table, in the researcher API's shapes. The
// answers and unit versions stream from a database cursor in batches; the
// small tables come whole. One read-only snapshot for all of them. Clients
// shape the data themselves (wide tables, labels, CSV), so one stored
// export serves all of them.

/** Rows per database fetch. */
const BATCH = 5000;

export interface ExportOptions {
  /** Rows per database fetch (tests use a small one). */
  batch?: number;
}

/**
 * What an export of the study holds, as a short hash: it changes when
 * answers, unit versions, design versions, deployments, sessions (their
 * ending, deletion requests, display), coders (their email addresses),
 * devices, deletions or sets change.
 */
export async function exportStamp(db: Db, studyId: number): Promise<string> {
  const [row] = await rows<Record<string, unknown>>(
    db,
    sql`SELECT
      (SELECT concat_ws('/', count(*), max(updated), max(retired_at)) FROM annotation_values WHERE study_id = ${studyId}) AS answers,
      (SELECT max(id) FROM unit_versions WHERE study_id = ${studyId}) AS units,
      (SELECT concat_ws('/', count(*), max(updated)) FROM design_versions WHERE study_id = ${studyId}) AS designs,
      (SELECT max(version) FROM deployment_versions WHERE study_id = ${studyId}) AS deployments,
      (SELECT md5(string_agg(concat_ws('/', id, ended, deletion_request, display, coder), ',' ORDER BY id))
        FROM coder_sessions WHERE study_id = ${studyId}) AS sessions,
      (SELECT md5(string_agg(concat_ws('/', id, email), ',' ORDER BY id)) FROM coders WHERE study_id = ${studyId}) AS coders,
      (SELECT max(id) FROM session_devices WHERE study_id = ${studyId}) AS devices,
      (SELECT max(id) FROM session_deletions WHERE study_id = ${studyId}) AS deletions,
      (SELECT md5(string_agg(concat_ws('/', m.set_id, m.unit_id, m.position), ',' ORDER BY m.set_id, m.unit_id))
        FROM unit_set_members m JOIN unit_sets s ON s.id = m.set_id WHERE s.study_id = ${studyId}) AS sets`,
  );
  return sha256Hex(JSON.stringify([RESULTS_EXPORT_FORMAT_VERSION, row])).slice(0, 16);
}

/** Answers in `AnnotationRow`'s shape (contracts annotations.ts), also reset ones, in the order written. */
const answersQuery = (studyId: number): SQL => sql`
  SELECT a.id, a.unit_id AS "unitId", u.external_id AS "externalId", a.session_id AS "sessionId", s.coder,
    a.variable, a.value, a.design_version_id AS "designVersionId", a.unit_version_id AS "unitVersionId",
    a.device_id AS "deviceId", a.assigned, a.timing, v.first_served AS "servedAt", a.created, a.updated,
    a.retired_at AS "retiredAt"
  FROM annotation_values a
  LEFT JOIN units u ON u.id = a.unit_id
  LEFT JOIN coder_sessions s ON s.id = a.session_id
  LEFT JOIN unit_serves v ON v.session_id = a.session_id AND v.unit_id = a.unit_id
  WHERE a.study_id = ${studyId}
  ORDER BY a.id`;

/** Unit versions in `UnitVersion`'s shape (contracts annotations.ts), oldest first. */
const unitsQuery = (studyId: number): SQL => sql`
  SELECT id, "unitId", "externalId", ${unitDataHash(sql.raw("data"))} AS hash, data, created FROM (
    SELECT v.id, v.unit_id AS "unitId", u.external_id AS "externalId",
      ${unitVersionData(sql.raw("v.id"))} AS data, v.created
    FROM unit_versions v JOIN units u ON u.id = v.unit_id
    WHERE v.study_id = ${studyId}
  ) versions ORDER BY id`;

/**
 * The study's coders (expert and crowd), also ones who haven't started. An
 * expert coder's email address only where the deployed design has coders
 * sign in (as for sessions' addresses).
 */
async function coderRows(tx: Db, studyId: number) {
  const withEmail = loginRequired(await deployedSession(tx, studyId));
  const found = await tx
    .select({ coder: coders.coder, kind: coders.kind, email: coders.email, created: coders.created })
    .from(coders)
    .where(eq(coders.studyId, studyId))
    .orderBy(asc(coders.id));
  return found.map(({ email, ...coder }) => ({ ...coder, ...(withEmail && email ? { email } : {}) }));
}

/** A query's rows in batches, through a cursor (in the caller's transaction). */
async function* batches(tx: Db, name: string, query: SQL, batch: number): AsyncGenerator<unknown[]> {
  await tx.execute(sql`DECLARE ${sql.identifier(name)} NO SCROLL CURSOR FOR ${query}`);
  for (;;) {
    const found = await rows<unknown>(
      tx,
      sql`FETCH ${sql.raw(String(Math.floor(batch)))} FROM ${sql.identifier(name)}`,
    );
    if (found.length === 0) break;
    yield found;
  }
  await tx.execute(sql`CLOSE ${sql.identifier(name)}`);
}

/** The zip's bytes as they are made, from the study's tables in one snapshot. */
async function* exportZip(tx: Db, studyId: number, studyName: string, batch: number): AsyncGenerator<Uint8Array> {
  const out: Uint8Array[] = [];
  let failed: Error | null = null;
  const zip = new Zip((error, chunk) => {
    if (error) failed = error;
    else out.push(chunk);
  });
  const take = function* () {
    if (failed) throw failed;
    while (out.length > 0) yield out.shift()!;
  };
  const counts: Record<string, number> = {};

  // A file of JSON lines, from batches of rows
  async function* file(name: string, source: AsyncIterable<unknown[]> | unknown[]) {
    const entry = new ZipDeflate(name, { level: 6 });
    zip.add(entry);
    counts[name] = 0;
    for await (const batch of Array.isArray(source) ? [source] : source) {
      if (batch.length === 0) continue;
      counts[name] += batch.length;
      entry.push(strToU8(batch.map((row) => JSON.stringify(row)).join("\n") + "\n"));
      yield* take();
    }
    entry.push(new Uint8Array(0), true);
    yield* take();
  }

  yield* file("answers.jsonl", batches(tx, "export_answers", answersQuery(studyId), batch));
  yield* file("units.jsonl", batches(tx, "export_units", unitsQuery(studyId), batch));
  yield* file("sessions.jsonl", await listCoderProgress(tx, studyId));
  yield* file("coders.jsonl", await coderRows(tx, studyId));
  const coderKind = await studyCoderKind(tx, studyId);
  const versions = await tx
    .select()
    .from(designVersions)
    .where(eq(designVersions.studyId, studyId))
    .orderBy(asc(designVersions.id));
  // `number`: the version's number as researchers see it (its place among the study's versions)
  yield* file(
    "design_versions.jsonl",
    versions.map((v, i) => ({ ...toDesignVersion(v, coderKind), number: i + 1 })),
  );
  yield* file("deployments.jsonl", await deploymentVersions(tx, studyId));
  yield* file("sets.jsonl", await listSetGroups(tx, studyId));
  yield* file(
    "devices.jsonl",
    await tx
      .select({
        id: sessionDevices.id,
        sessionId: sessionDevices.sessionId,
        type: sessionDevices.deviceType,
        browser: sessionDevices.browser,
        os: sessionDevices.os,
        created: sessionDevices.created,
      })
      .from(sessionDevices)
      .where(eq(sessionDevices.studyId, studyId))
      .orderBy(asc(sessionDevices.id)),
  );
  yield* file("deletions.jsonl", await listCoderDeletions(tx, studyId));

  // Last: a file without it (or with other counts) is incomplete
  const manifest = new ZipDeflate("manifest.json", { level: 6 });
  zip.add(manifest);
  manifest.push(
    strToU8(
      JSON.stringify(
        {
          format: "annotinder-results-export",
          formatVersion: RESULTS_EXPORT_FORMAT_VERSION,
          study: { id: studyId, name: studyName },
          exported: new Date(),
          release: RELEASE,
          counts,
        },
        null,
        2,
      ),
    ),
    true,
  );
  zip.end();
  yield* take();
}

/** Where exports go: a folder per study. */
const EXPORTS = "exports";
const exportPrefix = (studyId: number) => `${EXPORTS}/${studyId}`;

/**
 * Removes the study's stored exports: after coders' data is deleted, answers
 * are reset or the study is deleted, a file made before holds what is gone,
 * and a download link handed out for it must stop working.
 */
export async function removeResultsExports(files: FileStore, studyId: number): Promise<void> {
  await files.removeAll(exportPrefix(studyId));
}

/** Removes the stored exports of studies that no longer exist (deleted while this server was down, or by another one). */
async function removeExportsOfDeletedStudies(db: Db, files: FileStore): Promise<void> {
  const folders = await files.list(EXPORTS);
  if (folders.length === 0) return;
  const existing = new Set((await db.select({ id: studies.id }).from(studies)).map((s) => `${EXPORTS}/${s.id}`));
  for (const folder of folders) if (!existing.has(folder)) await files.removeAll(folder);
}

/**
 * The study's raw export in `files`: the stored one if the study hasn't
 * changed since, else a new one (and the older ones removed). Returns its
 * key and size, and the name to save it as.
 */
export async function ensureResultsExport(
  db: Db,
  files: FileStore,
  studyId: number,
  { batch = BATCH }: ExportOptions = {},
): Promise<{ key: string; size: number; filename: string }> {
  const [study] = await db.select({ name: studies.name }).from(studies).where(eq(studies.id, studyId));
  const name = study?.name ?? `study ${studyId}`;
  const filename = `${name.replace(/[^\w-]+/g, "_")}_results_${new Date().toISOString().slice(0, 10)}.zip`;
  const stamp = await exportStamp(db, studyId);
  const key = `${exportPrefix(studyId)}/${stamp}.zip`;
  const stored = await files.size(key);
  if (stored !== null) return { key, size: stored, filename };

  const { size } = await db.transaction(
    async (tx) => {
      // Every answer of a large study takes longer to write out than a request's statements may
      await withoutTimeLimits(tx);
      return files.put(key, exportZip(tx as unknown as Db, studyId, name, batch));
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
  for (const other of await files.list(exportPrefix(studyId))) if (other !== key) await files.remove(other);
  await removeExportsOfDeletedStudies(db, files);
  return { key, size, filename };
}
