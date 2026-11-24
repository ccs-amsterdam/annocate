import { gunzipSync, gzipSync } from "node:zlib";
import { beforeEach, describe, expect, it } from "vitest";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { is } from "drizzle-orm";
import { PgTable as PgTableClass } from "drizzle-orm/pg-core";
import {
  StudyResponseSchema,
  type AnnotationRow,
  type CoderProgress,
  type DesignVersion,
  type DesignVersionMeta,
} from "@annotinder/contracts";
import type { Db } from "../db/index.js";
import * as schema from "../db/schema/index.js";
import { createApp } from "../app.js";
import { createApiKey, ensureUser, setServerRole } from "../shared/accounts.js";
import { EXPORTED_TABLES, NOT_EXPORTED } from "../shared/studyExport.js";
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
  const { coders } = await json<{ coders: CoderProgress[] }>(`/api/study/${studyId}/coders`);
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
describe("study exports", { timeout: 30_000 }, () => {
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
