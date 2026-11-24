import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { sql } from "drizzle-orm";
import {
  AnnotationRowSchema,
  CoderProgressSchema,
  ResultsExportManifestSchema,
  ResultsExportSchema,
  StudyResponseSchema,
  UnitVersionSchema,
} from "@annotinder/contracts";
import type { Db } from "../db/index.js";
import { createApp } from "../app.js";
import { DiskFileStore, fileToken } from "../shared/files.js";
import { ensureResultsExport } from "../shared/resultsExport.js";
import { emptyDb } from "./testDb.js";

// The raw results export (docs/plans/exports-and-files.md): a zip of JSON
// lines in the API's shapes, behind a short-lived link, reused while the
// study is unchanged.

let db: Db;
let app: ReturnType<typeof createApp>;
let files: DiskFileStore;
const secret = "test-secret";
const headers = { "content-type": "application/json", "x-dev-role": "ADMIN", "x-dev-email": "r@uni.nl" };

beforeEach(async () => {
  db = await emptyDb();
  files = new DiskFileStore(await mkdtemp(join(tmpdir(), "annotinder-test-")));
  app = createApp(db, { devMode: true, secret, files });
});

async function example(id: string): Promise<number> {
  const res = await app.request("/api/study/from-example", {
    method: "POST",
    headers,
    body: JSON.stringify({ example: id }),
  });
  return StudyResponseSchema.parse(await res.json()).id;
}

async function exportOf(studyId: number) {
  const res = await app.request(`/api/study/${studyId}/results/export`, { method: "POST", headers });
  expect(res.status).toBe(200);
  return ResultsExportSchema.parse(await res.json());
}

/** The export's files, by name; JSON lines as rows. */
async function download(url: string) {
  const res = await app.request(url);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-disposition")).toMatch(/attachment; filename=".*_results_.*\.zip"/);
  const zip = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const lines = (name: string) =>
    strFromU8(zip[name])
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as unknown);
  return {
    names: Object.keys(zip),
    lines,
    manifest: ResultsExportManifestSchema.parse(JSON.parse(strFromU8(zip["manifest.json"]))),
  };
}

describe("results export", () => {
  it("is a zip of JSON lines in the API's shapes, with a manifest counting them", async () => {
    const study = await example("swipe-sentiment");
    const { url, size } = await exportOf(study);
    expect(size).toBeGreaterThan(0);
    const { names, lines, manifest } = await download(url);
    expect(names.sort()).toEqual(
      [
        "answers.jsonl",
        "coders.jsonl",
        "deletions.jsonl",
        "deployments.jsonl",
        "design_versions.jsonl",
        "devices.jsonl",
        "manifest.json",
        "sets.jsonl",
        "units.jsonl",
      ].sort(),
    );
    for (const name of names.filter((n) => n.endsWith(".jsonl")))
      expect(lines(name)).toHaveLength(manifest.counts[name]);
    expect(manifest.counts["answers.jsonl"]).toBe(30);
    expect(manifest).toMatchObject({ format: "annotinder-results-export", formatVersion: 1 });
    for (const row of lines("answers.jsonl")) AnnotationRowSchema.parse(row);
    for (const row of lines("units.jsonl")) UnitVersionSchema.parse(row);
    for (const row of lines("coders.jsonl")) CoderProgressSchema.parse(row);
    expect(lines("design_versions.jsonl")[0]).toMatchObject({ number: 1, items: expect.any(Array) });
    // The same as the paged answers API
    const api = (await (await app.request(`/api/study/${study}/annotations?limit=10000`, { headers })).json()) as {
      annotations: unknown[];
    };
    expect(lines("answers.jsonl").map((r) => (r as { id: number }).id)).toEqual(
      api.annotations.map((r) => (r as { id: number }).id),
    );
  });

  it("reads the answers in batches", async () => {
    const study = await example("swipe-sentiment");
    const { key } = await ensureResultsExport(db, files, study, { batch: 7 });
    const res = await app.request(`/api/files/${fileToken(secret, key, "x.zip", Date.now() + 60_000)}`);
    const zip = unzipSync(new Uint8Array(await res.arrayBuffer()));
    expect(strFromU8(zip["answers.jsonl"]).trim().split("\n")).toHaveLength(30);
  });

  it("is reused while the study is unchanged; a change makes a new one and removes the old", async () => {
    const study = await example("swipe-sentiment");
    const first = await ensureResultsExport(db, files, study);
    expect((await ensureResultsExport(db, files, study)).key).toBe(first.key);
    await db.execute(
      sql`UPDATE annotation_values SET updated = now() WHERE id = (SELECT min(id) FROM annotation_values WHERE study_id = ${study})`,
    );
    const second = await ensureResultsExport(db, files, study);
    expect(second.key).not.toBe(first.key);
    expect(await readdir(join(files.root, "exports", String(study)))).toEqual([second.key.split("/").at(-1)]);
  });

  it("refuses expired, altered and unknown links, and studies the user can't read", async () => {
    const study = await example("swipe-sentiment");
    const { key } = await ensureResultsExport(db, files, study);
    const expired = fileToken(secret, key, "x.zip", Date.now() - 1);
    expect((await app.request(`/api/files/${expired}`)).status).toBe(404);
    const valid = fileToken(secret, key, "x.zip", Date.now() + 60_000);
    const [payload, signature] = valid.split(".");
    const other = Buffer.from(
      JSON.stringify({ key: "exports/999/x.zip", filename: "x.zip", expires: Date.now() + 60_000 }),
    ).toString("base64url");
    expect((await app.request(`/api/files/${other}.${signature}`)).status).toBe(404);
    expect((await app.request(`/api/files/${payload}.${signature}`)).status).toBe(200);
    expect(
      (await app.request(`/api/files/${fileToken("another-secret", key, "x.zip", Date.now() + 60_000)}`)).status,
    ).toBe(404);
    const stranger = { ...headers, "x-dev-role": "", "x-dev-email": "stranger@uni.nl" };
    expect(
      (await app.request(`/api/study/${study}/results/export`, { method: "POST", headers: stranger })).status,
    ).not.toBe(200);
  });
});
