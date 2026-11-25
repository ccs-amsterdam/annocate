import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { beforeEach, describe, expect, it } from "vitest";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { is } from "drizzle-orm";
import { PgTable as PgTableClass } from "drizzle-orm/pg-core";
import {
  StudyResponseSchema,
  type AnnotationRow,
  type CoderProgress,
  type CoderResponse,
  type DesignVersion,
  type DesignVersionMeta,
} from "@annotinder/contracts";
import type { Db } from "../db/index.js";
import * as schema from "../db/schema/index.js";
import { createApp } from "../app.js";
import { listExamples } from "../examples.js";
import { createApiKey, ensureUser, setServerRole } from "../shared/accounts.js";
import { EXPORTED_TABLES, NOT_EXPORTED, exportStudy } from "../shared/studyExport.js";
import { emptyDb, query } from "./testDb.js";

// Study exports (shared/studyExport.ts): the whole study, coders and answers
// included, exported and imported as a new study with new ids.

let db: Db;
let app: ReturnType<typeof createApp>;

beforeEach(async () => {
  db = await emptyDb();
  app = createApp(db, { devMode: true });
});

const headers = {
  "content-type": "application/json",
  "x-dev-role": "ADMIN",
  "x-dev-email": "r@uni.nl",
  "x-dev-account-role": "researcher",
};
const call = (path: string, init: RequestInit = {}) =>
  app.request(path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
const json = async <T>(path: string): Promise<T> => (await (await call(path)).json()) as T;

async function exampleStudy(example = "swipe-sentiment"): Promise<number> {
  const res = await call("/api/study/from-example", { method: "POST", body: JSON.stringify({ example }) });
  return StudyResponseSchema.parse(await res.json()).id;
}

async function exported(studyId: number): Promise<Buffer> {
  const res = await call(`/api/study/${studyId}/export`);
  expect(res.status, await res.clone().text()).toBe(200);
  expect(res.headers.get("content-disposition")).toMatch(/\.annotinder\.gz"$/);
  return Buffer.from(await res.arrayBuffer());
}

async function imported(bytes: Buffer, query = ""): Promise<Response> {
  return call(`/api/study/import${query}`, {
    method: "POST",
    body: new Uint8Array(bytes),
    headers: { "content-type": "application/octet-stream" },
  });
}

type ExportRow = { table: string; row: Record<string, unknown> };

/** An export file taken apart: its manifest and its rows. */
function unpacked(bytes: Buffer): { manifest: Record<string, unknown>; rows: ExportRow[] } {
  const [first, ...rest] = gunzipSync(bytes).toString("utf8").trim().split("\n");
  return {
    manifest: JSON.parse(first!) as Record<string, unknown>,
    rows: rest.map((line) => JSON.parse(line) as ExportRow),
  };
}

/** An export file put together again. */
const packed = (manifest: object, rows: ExportRow[]) =>
  gzipSync(Buffer.from([manifest, ...rows].map((line) => JSON.stringify(line)).join("\n") + "\n"));

const rowsOf = (rows: ExportRow[], table: string) => rows.filter((r) => r.table === table).map((r) => r.row);

/** How far the sequences of the tables an import fills have come. */
const sequences = (database: Db) =>
  query(
    database,
    `SELECT sequencename, last_value FROM pg_sequences
     WHERE sequencename ~ '^(studies|units|unit_values|design_versions|links|coder_sessions|annotation_values)_id_seq$'
     ORDER BY sequencename`,
  );

/** Everything a study holds, by what people see (external ids, positions), not by database ids. */
async function contents(studyId: number) {
  const units = (
    await json<{ units: { id: number; externalId: string; data: unknown }[] }>(
      `/api/study/${studyId}/units/page?offset=0&limit=200`,
    )
  ).units;
  const unitIds = new Map(units.map((u) => [u.id, u.externalId]));
  const sets = await json<{ name: string; sets: { name: string; unitIds: number[] }[] }[]>(
    `/api/study/${studyId}/sets`,
  );
  const { versions } = await json<{ versions: DesignVersionMeta[] }>(`/api/study/${studyId}/design`);
  const versionIndex = new Map(versions.map((v, i) => [v.id, i]));
  const designs = await Promise.all(versions.map((v) => json<DesignVersion>(`/api/study/${studyId}/design/${v.id}`)));
  const deployment = await json<{ designVersionId: number; version: number; active: boolean } | null>(
    `/api/study/${studyId}/deployment`,
  );
  const { links } = await json<{
    links: { label: string; params: unknown; maxUses?: number; uses: number; secret: string }[];
  }>(`/api/study/${studyId}/links`);
  const { sessions: coders } = await json<{ sessions: CoderProgress[] }>(`/api/study/${studyId}/sessions`);
  const coderList = (await json<{ coders: CoderResponse[] }>(`/api/study/${studyId}/coders`)).coders;
  const coderIndex = new Map(coders.map((c, i) => [c.id, i]));
  const answers = (await json<{ annotations: AnnotationRow[] }>(`/api/study/${studyId}/annotations?limit=10000`))
    .annotations;
  const study = await json<Record<string, unknown>>(`/api/study/${studyId}`);
  return {
    study: { name: study.name, reopenMinutes: study.reopenMinutes, origin: study.origin },
    units: units.map((u) => [u.externalId, u.data]),
    sets: sets.map((g) => [g.name, g.sets.map((s) => [s.name, s.unitIds.map((id) => unitIds.get(id))])]),
    designs: designs.map((d) => ({
      items: d.items,
      session: d.session,
      units: d.units,
      public: d.public,
      note: d.note,
    })),
    deployment: deployment && {
      design: versionIndex.get(deployment.designVersionId),
      version: deployment.version,
      active: deployment.active,
    },
    links: links.map((l) => ({ label: l.label, params: l.params, maxUses: l.maxUses, uses: l.uses })),
    coders: coders.map((c) => ({ ...c, id: undefined, link: undefined, linkId: undefined, lastActive: undefined })),
    coderList: coderList.map((c) => ({ ...c, id: undefined, lastActive: undefined })),
    answers: answers.map((a) => ({
      coder: coderIndex.get(a.sessionId),
      unit: a.unitId === null ? null : unitIds.get(a.unitId),
      design: a.designVersionId === null ? null : versionIndex.get(a.designVersionId),
      variable: a.variable,
      value: a.value,
    })),
  };
}

// Each import starts an in-memory database (a second or two): more time than most tests
describe("study exports", { timeout: 60_000 }, () => {
  it("an export imports as a new study: units, sets, design versions, deployment, links, coders and answers", async () => {
    const original = await exampleStudy();
    const bytes = await exported(original);
    const res = await imported(bytes, "?name=Moved");
    expect(res.status, await res.clone().text()).toBe(201);
    const copy = StudyResponseSchema.parse(await res.json());
    expect(copy.id).not.toBe(original);
    expect(copy.name).toBe("Moved");

    const before = await contents(original);
    const after = await contents(copy.id);
    expect(after.answers.length).toBeGreaterThan(0);
    expect({ ...after, study: { ...after.study, name: before.study.name } }).toEqual(before);
    // Links are this server's: new secrets
    const secrets = async (id: number) =>
      (await json<{ links: { secret: string }[] }>(`/api/study/${id}/links`)).links.map((l) => l.secret);
    const [old, made] = [await secrets(original), await secrets(copy.id)];
    expect(made.filter((s) => old.includes(s))).toEqual([]);
    // And its own public id: the copy's coder links are not the original's
    const publicIds = await query<{ public_id: string }>(db, "SELECT public_id FROM studies WHERE id IN ($1, $2)", [
      original,
      copy.id,
    ]);
    expect(new Set(publicIds.map((s) => s.public_id)).size).toBe(2);
    expect(copy.publicId).toMatch(/^[a-z0-9]{12}$/);
    // The importer owns it (development headers: no study roles), and the codings are derived again
    const [row] = await query<{ owner_id: number | null }>(db, "SELECT owner_id FROM studies WHERE id = $1", [copy.id]);
    expect(row!.owner_id).not.toBeNull();
    // The copy can be coded and exported again
    expect((await exported(copy.id)).length).toBeGreaterThan(0);
  });

  it("without coders: the study, its units and design, and no coders, answers or link uses", async () => {
    const original = await exampleStudy();
    const res = await imported(await exported(original), "?coders=false");
    expect(res.status).toBe(201);
    const copy = await contents(StudyResponseSchema.parse(await res.json()).id);
    const before = await contents(original);
    expect(copy.coders).toEqual([]);
    expect(copy.answers).toEqual([]);
    // The expert coders come along (the units' coder_set names them), without what they did
    expect(copy.coderList.map((c) => [c.coder, c.kind, c.assigned, c.done, c.sessions])).toEqual(
      before.coderList.map((c) => [c.coder, c.kind, c.assigned, 0, 0]),
    );
    expect(copy.sets).toEqual(before.sets);
    expect(copy.units).toEqual(before.units);
    expect(copy.designs).toEqual(before.designs);
    expect(copy.links.map((l) => l.uses)).toEqual(before.links.map(() => 0));
  });

  it("an export from an earlier migration is migrated on import", async () => {
    const bytes = await exported(await exampleStudy());
    // As if exported before the last migration (the seed): that migration runs on the export's rows
    const [first, ...rest] = gunzipSync(bytes).toString("utf8").trim().split("\n");
    const manifest = JSON.parse(first!) as { migration: { idx: number; tag: string } };
    expect(manifest.migration.idx).toBeGreaterThan(0);
    manifest.migration = { idx: 0, tag: "0000_init" };
    const older = gzipSync(Buffer.from([JSON.stringify(manifest), ...rest].join("\n")));
    expect((await imported(older)).status).toBe(201);
  });

  it("refuses what isn't an export, or comes from a newer or unknown database", async () => {
    const bytes = await exported(await exampleStudy());
    const [first, ...rest] = gunzipSync(bytes).toString("utf8").trim().split("\n");
    const manifest = JSON.parse(first!) as Record<string, unknown>;
    const remade = (m: object) => gzipSync(Buffer.from([JSON.stringify(m), ...rest].join("\n")));
    const refusal = async (body: Buffer) => {
      const res = await imported(body);
      return [res.status, ((await res.json()) as { error: string }).error];
    };
    expect(await refusal(Buffer.from("not gzip"))).toEqual([400, expect.stringContaining("can't be unpacked")]);
    expect(await refusal(gzipSync(Buffer.from('{"hello":1}')))).toEqual([400, "This isn't a study export"]);
    expect(await refusal(remade({ ...manifest, formatVersion: 9, client: { release: "9.0.0", commit: "x" } }))).toEqual(
      [400, expect.stringContaining("newer AnnoTinder (9.0.0)")],
    );
    expect(await refusal(remade({ ...manifest, migration: { idx: 99, tag: "0099_future" } }))).toEqual([
      400,
      expect.stringContaining("newer AnnoTinder"),
    ]);
    expect(await refusal(remade({ ...manifest, migration: { idx: 0, tag: "0000_other" } }))).toEqual([
      400,
      expect.stringContaining("doesn't know"),
    ]);
    expect((await query<{ n: number }>(db, "SELECT count(*)::int AS n FROM studies"))[0]!.n).toBe(1);
  });

  it("refuses an export whose deployed design, design versions or settings wouldn't pass a save or a deploy", async () => {
    const { manifest, rows } = unpacked(await exported(await exampleStudy()));
    const deployedId = rowsOf(rows, "deployments")[0]!.design_version_id;
    /** The export with one row changed. */
    const changed = (table: string, pick: (row: Record<string, unknown>) => boolean, change: object) =>
      packed(
        manifest,
        rows.map((r) => (r.table === table && pick(r.row) ? { table, row: { ...r.row, ...change } } : r)),
      );
    const refusal = async (body: Buffer) => {
      const res = await imported(body);
      return [res.status, await res.json()];
    };
    // The deployed design: what deploying checks
    expect(
      await refusal(
        changed("design_versions", (v) => v.id === deployedId, { items: [{ type: "nonsense", name: "q" }] }),
      ),
    ).toEqual([400, expect.objectContaining({ code: "export_invalid", error: expect.stringContaining("deployed") })]);
    expect(await refusal(changed("design_versions", (v) => v.id === deployedId, { units: { fields: [] } }))).toEqual([
      400,
      expect.objectContaining({ issues: [expect.objectContaining({ message: expect.stringContaining("declare") })] }),
    ]);
    // Any design version: what saving checks (here a URL parameter's pattern)
    expect(
      await refusal(changed("design_versions", () => true, { session: { urlParams: [{ name: "p", pattern: "(" }] } })),
    ).toEqual([400, expect.objectContaining({ code: "export_invalid", error: expect.stringContaining("design") })]);
    // The study's settings: a redirect URL is a web address
    expect(await refusal(changed("studies", () => true, { redirect_urls: { panel: "javascript:alert(1)" } }))).toEqual([
      400,
      expect.objectContaining({ code: "export_invalid", error: expect.stringContaining("settings") }),
    ]);
    // The study's kind of coders: the kind its deployed design invites, recorded by the first deploy
    const kind = rowsOf(rows, "studies")[0]!.coder_kind;
    expect(["expert", "crowd"]).toContain(kind);
    const other = kind === "crowd" ? "expert" : "crowd";
    for (const [coderKind, said] of [
      [other, "deployed"],
      [null, "kind of coders"],
      ["panel", "studies_coder_kind_check"],
    ] as const)
      expect(await refusal(changed("studies", () => true, { coder_kind: coderKind }))).toEqual([
        400,
        expect.objectContaining({ code: "export_invalid", error: expect.stringContaining(said) }),
      ]);
    // A line that isn't a row, and a row that doesn't fit its table
    const damaged = gzipSync(Buffer.from([JSON.stringify(manifest), '{"table":"units"}', ""].join("\n")));
    expect(await refusal(damaged)).toEqual([400, expect.objectContaining({ code: "export_invalid" })]);
    expect(await refusal(changed("units", () => true, { external_id: null }))).toEqual([
      400,
      expect.objectContaining({ code: "export_invalid", error: expect.stringContaining("units") }),
    ]);
    expect((await query<{ n: number }>(db, "SELECT count(*)::int AS n FROM studies"))[0]!.n).toBe(1);
  });

  it(
    "an import over a limit is refused before it takes ids: the sequences stay where they were",
    { timeout: 180_000 },
    async () => {
      const bytes = await exported(await exampleStudy());
      const { rows } = unpacked(bytes);
      const before = await sequences(db);
      const refusedWith = async (limits: object) => {
        await query(db, "UPDATE users SET limits = $1::jsonb WHERE email = 'r@uni.nl'", [JSON.stringify(limits)]);
        const res = await imported(bytes);
        return [res.status, ((await res.json()) as { code?: string }).code];
      };
      expect(await refusedWith({ unitsPerStudy: 1 })).toEqual([403, "limit_reached"]);
      // The owner's units in all studies: those of the first study count
      expect(await refusedWith({ units: rowsOf(rows, "units").length + 1 })).toEqual([403, "limit_reached"]);
      expect(await refusedWith({ codersPerStudy: 0 })).toEqual([403, "limit_reached"]);
      expect(await refusedWith({ answersPerStudy: 1 })).toEqual([403, "limit_reached"]);
      expect(await sequences(db)).toEqual(before);
      // A unit or an answer larger than this server takes
      await query(db, "UPDATE users SET limits = '{}'::jsonb");
      await query(db, "UPDATE server_settings SET answer_bytes = 1");
      expect((await imported(bytes)).status).toBe(403);
      await query(db, "UPDATE server_settings SET answer_bytes = 65536, unit_bytes = 1");
      expect((await imported(bytes)).status).toBe(403);
      expect(await sequences(db)).toEqual(before);
    },
  );

  it("a loop that takes an earlier loop's units keeps its unit list: the ids in a session's JSON are renumbered", async () => {
    const original = await exampleStudy();
    const { manifest, rows } = unpacked(await exported(original));
    const units = rowsOf(rows, "units");
    const [first, second] = [units[1]!, units[0]!];
    const session = rowsOf(rows, "coder_sessions")[0]!;
    const withList = rows.map((r) =>
      r.table === "coder_sessions" && r.row.id === session.id
        ? {
            table: r.table,
            row: {
              ...r.row,
              assignments: { again: { at: 1, units: [first.id, second.id, 999_999] } },
              ended: { reason: "quit", at: "2026-01-01T00:00:00.000Z", unit: { loop: "again", id: first.id } },
            },
          }
        : r,
    );
    // Other units before it, so the copy's unit ids differ from the original's
    await exampleStudy();
    const res = await imported(packed(manifest, withList));
    expect(res.status, await res.clone().text()).toBe(201);
    const copy = StudyResponseSchema.parse(await res.json()).id;
    const [moved] = await query<{ listed: string[]; ended: string; ids: number[] }>(
      db,
      `SELECT ARRAY(SELECT u.external_id FROM jsonb_array_elements_text(s.assignments->'again'->'units') WITH ORDINALITY AS l(id, n)
                    JOIN units u ON u.id = l.id::bigint AND u.study_id = s.study_id ORDER BY l.n) AS listed,
              (SELECT u.external_id FROM units u WHERE u.id = (s.ended->'unit'->>'id')::bigint AND u.study_id = s.study_id) AS ended,
              ARRAY(SELECT jsonb_array_elements_text(s.assignments->'again'->'units')::int) AS ids
       FROM coder_sessions s WHERE s.study_id = $1 AND s.assignments ? 'again'`,
      [copy],
    );
    // The same units in the same order (the unit the export doesn't have is left out), under new ids
    expect(moved!.listed).toEqual([first.external_id, second.external_id]);
    expect(moved!.ended).toBe(first.external_id);
    expect(moved!.ids).not.toEqual([first.id, second.id]);
  });

  it("without coders, a crowd's coders stay behind", async () => {
    const original = await exampleStudy("simple-survey");
    const before = await contents(original);
    expect(before.coderList.map((c) => c.kind)).toContain("crowd");
    const res = await imported(await exported(original), "?coders=false");
    expect(res.status, await res.clone().text()).toBe(201);
    expect((await contents(StudyResponseSchema.parse(await res.json()).id)).coderList).toEqual([]);
  });

  it("refuses an export whose session has a coder the export doesn't have", async () => {
    const { manifest, rows } = unpacked(await exported(await exampleStudy()));
    const without = rows.filter((r) => !(r.table === "coders" && r.row.coder === "Example coder 1"));
    const tables = (manifest.tables as { name: string; rows: number }[]).map((t) =>
      t.name === "coders" ? { ...t, rows: t.rows - 1 } : t,
    );
    const res = await imported(packed({ ...manifest, tables }, without));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      code: "export_invalid",
      error: expect.stringContaining("rows of coder_sessions don't fit the table"),
    });
  });

  it("leaves coders' email addresses out, unless the deployed design has coders sign in", async () => {
    const study = await exampleStudy();
    await query(db, "UPDATE coder_sessions SET email = 'coder' || id || '@uni.nl' WHERE study_id = $1", [study]);
    await query(db, "UPDATE coders SET email = 'coder' || id || '@uni.nl' WHERE study_id = $1", [study]);
    const emails = async () => {
      const { rows } = unpacked(await exported(study));
      return [...rowsOf(rows, "coder_sessions"), ...rowsOf(rows, "coders")].map((s) => s.email);
    };
    expect((await emails()).length).toBeGreaterThan(0);
    expect((await emails()).every((email) => email === null)).toBe(true);
    await query(
      db,
      `UPDATE design_versions SET session = jsonb_set(session, '{invite}', '{"mode": "coders", "link": "login"}')
       WHERE id = (SELECT design_version_id FROM deployments WHERE study_id = $1)`,
      [study],
    );
    expect((await emails()).every((email) => /^coder\d+@uni\.nl$/.test(String(email)))).toBe(true);
  });

  it.each(listExamples().map((e) => e.id))("the %s example is exported and imported as the same study", async (id) => {
    const study = await exampleStudy(id);
    const res = await imported(await exported(study));
    expect(res.status, await res.clone().text()).toBe(201);
    const copy = StudyResponseSchema.parse(await res.json());
    expect(await contents(copy.id)).toEqual(await contents(study));
  });

  it("an export read in small pages holds the same rows, each once", async () => {
    const study = await exampleStudy();
    const whole = unpacked((await exportStudy(db, study)).bytes);
    const paged = unpacked((await exportStudy(db, study, 3)).bytes);
    expect(paged.rows.length).toBeGreaterThan(30);
    expect(paged.rows).toEqual(whole.rows);
    const counted = whole.manifest.tables as { name: string; rows: number }[];
    expect(paged.manifest.tables).toEqual(counted);
    expect(counted.map((t) => t.rows)).toEqual(counted.map((t) => rowsOf(whole.rows, t.name).length));
  });

  it("at size: a study of 50,000 rows is imported and exported again", { timeout: 180_000 }, async () => {
    const { manifest, rows } = unpacked(await exported(await exampleStudy()));
    const studyId = rowsOf(rows, "studies")[0]!.id;
    const fieldId = rowsOf(rows, "unit_field_names")[0]!.id;
    const added: ExportRow[] = [];
    const UNITS = 16_500;
    for (let i = 0; i < UNITS; i++) {
      const id = 1_000_000 + i;
      const value = `A text of unit ${i} that is long enough to look like one`;
      const hash = "\\x" + createHash("sha256").update(JSON.stringify(value)).digest("hex");
      added.push({
        table: "units",
        row: { id, study_id: studyId, external_id: `big-${i}`, in_draft: true, coded: false },
      });
      added.push({ table: "unit_values", row: { id, study_id: studyId, hash, value } });
      added.push({ table: "unit_draft", row: { unit_id: id, field_id: fieldId, value_id: id } });
    }
    const big = packed(manifest, [...rows, ...added]);
    const started = Date.now();
    const res = await imported(big);
    const importTook = Date.now() - started;
    expect(res.status, await res.clone().text()).toBe(201);
    const copy = StudyResponseSchema.parse(await res.json()).id;
    const exportStarted = Date.now();
    const again = unpacked(await exported(copy));
    const exportTook = Date.now() - exportStarted;
    expect(again.rows.length).toBe(rows.length + added.length);
    expect(rowsOf(again.rows, "unit_draft").length).toBe(rowsOf(rows, "unit_draft").length + UNITS);
    // Linear in the rows: seconds, where a quadratic import took most of a minute at this size. Timed only
    // when asked (ANNOTINDER_TIMING_TESTS=1): a loaded machine or CI runner would fail it for no reason.
    if (process.env.ANNOTINDER_TIMING_TESTS) {
      expect(importTook).toBeLessThan(15_000);
      expect(exportTook).toBeLessThan(10_000);
    }
  });

  it("exporting is a study ADMIN's sensitive action: never with an API key", async () => {
    const study = await exampleStudy();
    const writer = await call(`/api/study/${study}/export`, { headers: { "x-dev-role": "WRITE" } });
    expect(writer.status).toBe(403);
    // An API key of the study's ADMIN
    const user = await ensureUser(db, "key@uni.nl");
    await setServerRole(db, user.id, "researcher");
    await query(db, "INSERT INTO roles (role, study_id, user_id) VALUES ('ADMIN', $1, $2)", [study, user.id]);
    const { key } = await createApiKey(db, user.id, "script");
    const res = await app.request(`/api/study/${study}/export`, { headers: { authorization: `Bearer ${key}` } });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "not_with_api_key" });
  });

  it("every table that holds a study's data is exported, or deliberately left out", () => {
    const tables = (Object.values(schema) as unknown[]).filter((t): t is PgTable => is(t, PgTableClass));
    const listed = new Set([...EXPORTED_TABLES, ...NOT_EXPORTED]);
    const studyTables = new Set<PgTable>([schema.studies]);
    // A study's tables: those that refer to a study's table (repeat until nothing is added)
    for (let added = true; added;) {
      added = false;
      for (const table of tables) {
        if (studyTables.has(table)) continue;
        const refs = getTableConfig(table).foreignKeys.map((fk) => fk.reference().foreignTable);
        if (refs.some((r) => studyTables.has(r))) {
          studyTables.add(table);
          added = true;
        }
      }
    }
    const missing = [...studyTables].filter((t) => !listed.has(t)).map((t) => getTableConfig(t).name);
    expect(missing).toEqual([]);
  });
});
