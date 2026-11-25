import { describe, expect, it } from "vitest";
import type { CoderUnitResponse, SessionResponse } from "@annotinder/contracts";
import { query } from "./testDb.js";
import { DbStore } from "../runtime/dbStore.js";

import {
  adminHeaders,
  db,
  server,
  send,
  coder,
  sentiment,
  demo,
  unitByExternalId,
  dbAnnotations,
  sentimentQuestion,
  redeploy,
  deployDrafts,
  draftUnit,
  createSet,
  listOf,
  crowd,
} from "./coderHarness.js";

describe("resuming and codebook updates", () => {
  it("refuses requests made with an older design version, until the session is loaded again", async () => {
    const c = coder("v");
    const { version } = await c.session();
    const unit = await c.next();
    const withVersion = (v: number) => ({ headers: { "x-annotinder-version": String(v) } });
    const answers = JSON.stringify({ unitId: unit!.id, variables: demo("neutral") });

    await redeploy({ units: {} }); // v2: only `sentiment`
    const stale = await c.call("/variables/unit", { method: "POST", body: answers, ...withVersion(version) });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: "design_changed" });
    expect(await dbAnnotations()).toHaveLength(0);

    // The session itself is always served, with the new version.
    const reloaded = (await (await c.call("/session", withVersion(version))).json()) as SessionResponse;
    expect(reloaded.version).toBe(version + 1);
    const fresh = await c.call("/variables/unit", {
      method: "POST",
      body: JSON.stringify({ unitId: unit!.id, variables: sentiment("neutral") }),
      ...withVersion(reloaded.version),
    });
    expect(fresh.status).toBe(200);
  });

  it("serves units the coder already finished, but not other units", async () => {
    const c = coder("res");
    const first = await c.next();
    await c.submit(first!.id, demo("positive"));
    const again = await c.call(`/loop/loop_1/units/${first!.id}`);
    expect(again.status).toBe(200);
    expect(((await again.json()) as CoderUnitResponse).variables.sentiment.values).toEqual([{ value: "positive" }]);

    const unit3 = (await unitByExternalId("unit-3")).id;
    expect((await c.call(`/loop/loop_1/units/${unit3}`)).status).toBe(404);
  });

  it("keeps answers to questions a design update removed, and tags the design version", async () => {
    // demo codebook: sentiment + actors_and_issues + other loop questions
    const c = coder("upd");
    const unit = await c.next();
    await c.submit(unit!.id, { ...demo("neutral"), actors_and_issues: { done: true, spans: [] } });

    await redeploy({ units: {} }); // v2: only `sentiment`
    expect((await c.submit(unit!.id, sentiment("positive"))).status).toBe(200);

    const [stored] = await dbAnnotations();
    expect(stored.variables.sentiment.values).toEqual([{ value: "positive" }]);
    expect(stored.variables).toHaveProperty("actors_and_issues"); // kept, though v2 no longer asks it
    const sentimentRows = await query(
      db,
      `SELECT design_version_id AS "designVersionId" FROM annotation_values WHERE variable = 'sentiment'`,
    );
    expect(sentimentRows).toEqual([{ designVersionId: 2 }]);
  });
});

describe("finished units follow the current codebook", () => {
  it("stores rederived codings a few thousand per statement", async () => {
    await query(db, "INSERT INTO units (study_id, external_id) SELECT 1, 'bulk-' || n FROM generate_series(1, 200) n");
    await query(db, "INSERT INTO coder_sessions (study_id, link_id) SELECT 1, 1 FROM generate_series(1, 100)");
    const unitIds = (await query<{ id: number }>(db, "SELECT id FROM units WHERE external_id LIKE 'bulk-%'")).map(
      (u) => u.id,
    );
    const sessionIds = (await query<{ id: number }>(db, "SELECT id FROM coder_sessions")).map((s) => s.id);
    const at = new Date("2026-01-02T03:04:05.678Z");
    // Agreement answers as stored: with quotes, braces, commas and a backslash
    const agreement = { sentiment: ':"pos\\it,{ive}"', topic: null };
    const codings = unitIds.flatMap((unitId) =>
      sessionIds.map((sessionId) => ({ loop: "loop_1", unitId, sessionId, agreement, created: at, updated: at })),
    );
    expect(codings).toHaveLength(20_000);
    const store = new DbStore(db, 1);
    const started = performance.now();
    await store.replaceCodings("a basis", codings);
    expect(performance.now() - started).toBeLessThan(3000);
    expect(await store.codingsBasis()).toBe("a basis");
    const stored = await store.listCodings({});
    expect(stored).toHaveLength(20_000);
    expect(stored[0]).toEqual({ ...codings[0], unitId: stored[0]!.unitId, sessionId: stored[0]!.sessionId });
    expect(new Set(stored.map((c) => `${c.unitId}/${c.sessionId}`)).size).toBe(20_000);
    // Again: the earlier ones are replaced
    await store.replaceCodings("another", codings.slice(0, 3));
    expect(await store.listCodings({})).toHaveLength(3);
  });

  const relevance = {
    type: "question",
    name: "relevance",
    variable: { type: "nominal", question: "?", options: [{ value: "yes" }, { value: "no" }] },
  };
  const fixedMain = { units: {} };

  it("reopens finished units when a loop gains a question, and warns on deploy", async () => {
    expect((await redeploy(fixedMain)).warnings).toBeUndefined();
    const c = coder("grow");
    const unit = await c.next();
    await c.submit(unit!.id, sentiment("positive"));
    expect((await c.session()).progress[0].doneUnitIds).toEqual([unit!.id]);

    const deployed = await redeploy({ ...fixedMain, children: [sentimentQuestion, relevance] });
    expect(deployed.warnings).toEqual([expect.stringContaining("relevance")]);

    // the unit is unfinished again: served first, with the earlier answer
    expect((await c.session()).progress[0].doneUnitIds).toEqual([]);
    const again = await c.next();
    expect(again!.id).toBe(unit!.id);
    expect(again!.variables.sentiment.values).toEqual([{ value: "positive" }]);
    await c.submit(unit!.id, { ...sentiment("positive"), relevance: { done: true, values: [{ value: "yes" }] } });
    expect((await c.session()).progress[0].doneUnitIds).toEqual([unit!.id]);
  });

  it("serves units again after a researcher resets them, keeping the old values", async () => {
    await redeploy(fixedMain);
    const c = coder("reset");
    const first = await c.next();
    await c.submit(first!.id, sentiment("negative"));
    expect((await c.next())!.id).not.toBe(first!.id);

    const res = await server.request("/api/study/1/annotations/reset", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ variables: ["sentiment"], unitIds: [first!.id] }),
    });
    expect(await res.json()).toEqual({ retired: 1 });

    expect((await c.session()).progress[0].doneUnitIds).toEqual([]);
    const again = await c.next();
    expect(again!.id).toBe(first!.id);
    expect(again!.variables).toEqual({}); // retired values are not served
    expect(await query(db, "SELECT COUNT(*)::int AS n FROM annotation_values WHERE retired_at IS NOT NULL")).toEqual([
      { n: 1 },
    ]);
  });

  it("tracks a unit separately in each loop it appears in", async () => {
    const second = {
      type: "unit_loop",
      id: "loop_1",
      label: "second_loop",
      units: {},
      children: [{ type: "layout", template: "" }, relevance],
    };
    await redeploy(fixedMain, [second]);
    const c = coder("two");
    // second_loop (first in the design) is loop_1, main_loop loop_2.
    const unit = await c.next("loop_2");
    expect((await c.submit(unit!.id, sentiment("neutral"), "loop_2")).status).toBe(200);

    // finished in main_loop, not in second_loop
    expect((await c.next("loop_2"))!.id).not.toBe(unit!.id);
    expect((await c.next("loop_1"))!.id).toBe(unit!.id);
    const progress = Object.fromEntries((await c.session()).progress.map((p) => [p.loop, p.doneUnitIds]));
    expect(progress).toEqual({ loop_1: [], loop_2: [unit!.id] });
  });
});

describe("deployment settings", () => {
  it("fill in end items' panel return links, and the design's sample size per link limits its sessions", async () => {
    const end = { type: "end", name: "done", outcome: "complete", redirectSetting: "panel_done" };
    const deployed = await redeploy({}, [crowd(undefined, { maxCoders: 1 }), end]);
    expect(deployed.warnings).toContainEqual(expect.stringContaining("'panel_done', which has no URL yet"));
    expect(JSON.stringify((await coder("first").session()).codebook.items)).not.toContain("redirectUrl");
    // The URL is a setting of the study: coders get it without a new version
    const put = await server.request("/api/study/1", {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({
        name: "Demo study",
        redirectUrls: { panel_done: "https://panel.example/done?id=$session.coder" },
      }),
    });
    expect(put.status).toBe(200);
    expect(((await put.json()) as { redirectUrls: unknown }).redirectUrls).toEqual({
      panel_done: "https://panel.example/done?id=$session.coder",
    });
    type Item = { type: string; redirectUrl?: string; children?: Item[] };
    const items = (await coder("first").session()).codebook.items as Item[];
    const served = items.flatMap((i) => (i.type === "branch" ? (i.children ?? []) : [i])).find((i) => i.type === "end");
    expect(served?.redirectUrl).toBe("https://panel.example/done?id=$session.coder");
    // maxUses 1: the demo link took "first"; a second new coder is refused
    const second = await send("second", "/session", {}, { "x-link-secret": "demo-secret" });
    expect(second.status).toBe(403);
    expect(await second.json()).toMatchObject({ code: "link_used_up" });
  });
});

describe("review regressions", () => {
  it("an upload that makes a design draft keeps the session; an empty set is deployed", async () => {
    const session = {
      type: "session",
      urlParams: [{ name: "wave", values: [{ value: "1" }], default: "1" }],
    };
    const end = { type: "end", name: "done", outcome: "complete", redirectSetting: "panel" };
    await redeploy({}, [session, end]);
    // An upload with a new column after the deploy: the new draft keeps the session
    const { data } = await draftUnit((await unitByExternalId("unit-1")).id);
    const upload = await server.request("/api/study/1/units", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ units: [{ externalId: "n1", data: { ...data, extra: "x" } }] }),
    });
    expect(upload.status).toBe(201);
    const list = (await listOf("design")) as {
      id: number;
    }[];
    const draft = (await (
      await server.request(`/api/study/1/design/${list.at(-1)!.id}`, { headers: adminHeaders })
    ).json()) as { session: unknown };
    expect(draft.session).toMatchObject({ urlParams: [{ name: "wave" }] });
    // An empty set is a change to deploy, and reaches the live sets
    await createSet("empty", [], "part_set");
    const pending = (await (
      await server.request("/api/study/1/deployment/pending", { headers: adminHeaders })
    ).json()) as { units: { sets: boolean } };
    expect(pending.units.sets).toBe(true);
    const deployed = await deployDrafts();
    const live = await query<{ name: string }>(
      db,
      "SELECT name FROM unit_sets WHERE study_id = 1 AND live AND name = 'empty'",
    );
    expect(live).toHaveLength(1);
    expect(deployed.version).toBeGreaterThan(1);
  });
});
