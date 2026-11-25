import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { ResultsExportSchema, StudyResponseSchema } from "@annotinder/contracts";
import type { Db } from "../db/index.js";
import { createApp } from "../app.js";
import { DiskFileStore } from "../shared/files.js";
import { emptyDb, query } from "./testDb.js";

// Deleting a study, by itself or with its owner's account: confirmed by
// typing a name, and nothing of the study stays behind.

let db: Db;
let app: ReturnType<typeof createApp>;
let files: DiskFileStore;
const headers = { "content-type": "application/json", "x-dev-role": "ADMIN", "x-dev-email": "r@uni.nl" };

beforeEach(async () => {
  db = await emptyDb();
  files = new DiskFileStore(await mkdtemp(join(tmpdir(), "annotinder-test-")));
  app = createApp(db, { devMode: true, secret: "test-secret", files });
});

/** An example study with coders' answers, and the link to its results export. */
async function studyWithExport(): Promise<{ id: number; name: string; exportUrl: string }> {
  const made = await app.request("/api/study/from-example", {
    method: "POST",
    headers,
    body: JSON.stringify({ example: "swipe-sentiment" }),
  });
  const { id, name } = StudyResponseSchema.parse(await made.json());
  const res = await app.request(`/api/study/${id}/results/export`, { method: "POST", headers });
  const exportUrl = ResultsExportSchema.parse(await res.json()).url;
  expect((await app.request(exportUrl)).status).toBe(200);
  return { id, name, exportUrl };
}

const remove = (path: string, body?: unknown) =>
  app.request(path, { method: "DELETE", headers, body: body === undefined ? undefined : JSON.stringify(body) });
const storedExports = () => readdir(join(files.root, "exports")).catch(() => []);
const studyCount = async () => (await query<{ n: number }>(db, "SELECT count(*)::int AS n FROM studies"))[0]!.n;

describe("deleting a study", () => {
  it("needs the study's name, typed out", async () => {
    const study = await studyWithExport();
    expect((await remove(`/api/study/${study.id}`)).status).toBe(400);
    expect((await remove(`/api/study/${study.id}`, {})).status).toBe(400);
    const wrong = await remove(`/api/study/${study.id}`, { confirm: `${study.name}?` });
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toMatchObject({ code: "confirmation_mismatch" });
    expect(await studyCount()).toBe(1);
    expect((await app.request(study.exportUrl)).status).toBe(200);

    expect((await remove(`/api/study/${study.id}`, { confirm: ` ${study.name} ` })).status).toBe(204);
    expect(await studyCount()).toBe(0);
  });

  it("removes its stored results export: a download link from before stops working", async () => {
    const study = await studyWithExport();
    expect(await storedExports()).toEqual([String(study.id)]);
    expect((await remove(`/api/study/${study.id}`, { confirm: study.name })).status).toBe(204);
    expect(await storedExports()).toEqual([]);
    expect((await app.request(study.exportUrl)).status).toBe(404);
  });

  it("with its owner's account: the exports of the studies that go are removed too", async () => {
    const study = await studyWithExport();
    expect((await remove("/api/me", { confirm: "r@uni.nl" })).status).toBe(204);
    expect(await studyCount()).toBe(0);
    expect(await storedExports()).toEqual([]);
    expect((await app.request(study.exportUrl)).status).toBe(404);
  });
});
