import { describe, expect, it } from "vitest";
import type { CoderProgress, SessionResponse } from "@annotinder/contracts";
import { query } from "./testDb.js";
import { DEMO_PUBLIC_ID } from "../db/publicId.js";
import { ensureUser } from "../shared/accounts.js";

import {
  adminHeaders,
  db,
  server,
  storeCalls,
  restart,
  devices,
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
  listOf,
  link,
  reach,
  sessionItem,
  crowd,
  useServer,
  forgetStoreCalls,
} from "./coderHarness.js";

describe("coder flow", () => {
  it("serves the session and units, and stores annotations", async () => {
    const c = coder("coder-a");
    const session = await c.session();
    // Coders aren't told the study's sequential id
    expect(session).not.toHaveProperty("studyId");
    // The coder codebook: no researcher notes, and loops without how units are handed out
    expect(session.codebook).not.toHaveProperty("note");
    const loop = session.codebook.items.find((i) => i.type === "unit_loop");
    expect(loop?.type === "unit_loop" && !("units" in loop)).toBe(true);

    const first = await c.next();
    expect(first?.externalId).toBe("unit-1");
    expect(first?.data.headline).toBeTypeOf("string");

    expect((await c.submit(first!.id, demo("positive"))).status).toBe(200);
    expect(await dbAnnotations()).toHaveLength(1);
    expect((await dbAnnotations())[0].variables.sentiment.values).toEqual([{ value: "positive" }]);

    expect((await c.next())?.externalId).toBe("unit-2");
    expect((await c.session()).progress).toEqual([{ loop: "loop_1", doneUnitIds: [first!.id], totalUnits: 3 }]);
  });

  it("rejects invalid annotations without writing them", async () => {
    const c = coder("coder-a");
    const unit = await c.next();
    expect((await c.submit(unit!.id, { nope: { done: true } })).status).toBe(400);
    expect((await c.submit(unit!.id, demo("ecstatic"))).status).toBe(400);
    // only finished units are accepted: every question of the loop needs a value
    const partial = await c.submit(unit!.id, sentiment("positive"));
    expect(partial.status).toBe(400);
    expect(await partial.json()).toMatchObject({ error: expect.stringContaining("actors_and_issues") });
    expect(await dbAnnotations()).toHaveLength(0);
  });

  it("requires a valid link for new coders", async () => {
    // Link problems are 404 or 403 with a code; 401 only asks for a login (auth_required)
    const none = await coder("coder-x", null).call("/session");
    expect(none.status).toBe(404);
    expect(await none.json()).toMatchObject({ code: "link_not_found" });
    const wrong = await coder("coder-x", "wrong").call("/session");
    expect(wrong.status).toBe(404);
    expect(await wrong.json()).toMatchObject({ code: "link_not_found" });
  });

  it("returns 404 for unknown or undeployed studies", async () => {
    const headers = { "x-annotinder": "1", "x-link-secret": "demo-secret" };
    expect((await server.request("/api/d/other/session", { headers })).status).toBe(404);
    expect((await server.request("/api/d/unknownstudy/session", { headers })).status).toBe(404);
  });

  it("a study is reached by its public id only: not by its sequential id", async () => {
    const headers = { "x-annotinder": "1", "x-link-secret": "demo-secret" };
    const [study] = await query<{ id: number; public_id: string }>(db, "SELECT id, public_id FROM studies");
    expect(study).toEqual({ id: 1, public_id: DEMO_PUBLIC_ID });
    expect((await server.request(`/api/d/${study!.public_id}/session`, { headers })).status).toBe(200);
    expect((await server.request(`/api/d/${study!.id}/session`, { headers })).status).toBe(404);
    // A new study gets a random one: 12 characters, each its own
    const made = async (name: string) =>
      (
        (await (
          await server.request("/api/study", { method: "POST", headers: adminHeaders, body: JSON.stringify({ name }) })
        ).json()) as { publicId: string }
      ).publicId;
    const [one, other] = [await made("One"), await made("Other")];
    expect(one).toMatch(/^[a-z0-9]{12}$/);
    expect(other).toMatch(/^[a-z0-9]{12}$/);
    expect(one).not.toBe(other);
  });

  it("rebuilds its state from the database after a restart", async () => {
    const c = coder("coder-a");
    const first = await c.next();
    await c.submit(first!.id, demo("neutral"));

    useServer(restart()); // fresh process: empty memory
    const again = coder("coder-a", null);
    expect((await again.session()).progress[0].doneUnitIds).toEqual([first!.id]);
    expect((await again.next())?.externalId).toBe("unit-2");
  });

  it("skips units that were deleted (once that is deployed)", async () => {
    const unit3 = await unitByExternalId("unit-3");
    expect(
      (await server.request(`/api/study/1/units/${unit3.id}`, { method: "DELETE", headers: adminHeaders })).status,
    ).toBe(204);
    await deployDrafts();

    const c = coder("coder-a");
    for (let i = 0; i < 2; i++) {
      const unit = await c.next();
      await c.submit(unit!.id, demo("neutral"));
    }
    expect(await c.next()).toBeNull();
  });
});

describe("sessions", () => {
  it("keeps a device id in an httpOnly cookie; stores only a per-study hash of it, with coarse device details", async () => {
    const iphone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    const res = await send("browser", "/session", {}, { "x-link-secret": "demo-secret", "user-agent": iphone });
    expect(res.status).toBe(200);
    const [set] = res.headers.getSetCookie();
    expect(set).toMatch(/^annotinder_device=/);
    expect(set).toContain("HttpOnly");
    expect(set).toContain("SameSite=Lax");
    expect(set).toContain("Path=/api/d");

    const deviceId = devices.get("browser")!.cookies.get("annotinder_device")!;
    const { sessionId } = (await res.json()) as SessionResponse;
    const [stored] = await query<{ key_hash: string; device_type: string; browser: string; os: string }>(
      db,
      "SELECT key_hash, device_type, browser, os FROM session_devices WHERE session_id = $1",
      [sessionId],
    );
    const { createHash } = await import("node:crypto");
    expect(stored).toEqual({
      key_hash: createHash("sha256").update(`${deviceId}\n${DEMO_PUBLIC_ID}\n`).digest("hex"),
      device_type: "phone",
      browser: "Safari",
      os: "iOS",
    });
    // The device id itself is stored nowhere
    expect(JSON.stringify(await query(db, "SELECT * FROM coder_sessions"))).not.toContain(deviceId);

    // the cookie continues the session; it isn't set again
    const again = await send("browser", "/session", {}, { "x-link-secret": "demo-secret" });
    expect(((await again.json()) as SessionResponse).sessionId).toBe(sessionId);
    expect(again.headers.getSetCookie()).toEqual([]);
  });

  it("records the device each answer was given on", async () => {
    const c = coder("answerer");
    const unit = await c.next();
    await c.submit(unit!.id, demo("neutral"));
    const rows = await query<{ device_id: number | null }>(
      db,
      "SELECT DISTINCT device_id FROM annotation_values WHERE unit_id = $1",
      [unit!.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].device_id).not.toBeNull();
    const listed = (await listOf("devices")) as {
      id: number;
    }[];
    expect(listed.map((d) => d.id)).toContain(rows[0].device_id);
  });

  it("refuses requests without the client header (CSRF)", async () => {
    const res = await server.request("/api/d/demostudy001/session", { headers: { "x-link-secret": "demo-secret" } });
    expect(res.status).toBe(403);
  });

  it("continues a device's session whatever link it comes back with; separate per participant", async () => {
    const other = await link();
    const a = (await (
      await send("shared", "/session", {}, { "x-link-secret": "demo-secret" })
    ).json()) as SessionResponse;
    const b = (await (await send("shared", "/session", {}, { "x-link-secret": other })).json()) as SessionResponse;
    const bare = (await (await send("shared", "/session")).json()) as SessionResponse; // no link at all
    expect(b.sessionId).toBe(a.sessionId);
    expect(bare.sessionId).toBe(a.sessionId);

    await redeploy({}, [crowd(undefined, { coderParam: { param: "participant" } })]);
    const panel = "demo-secret";
    const p1 = (await (
      await send("shared", "/session", {}, { "x-link-secret": panel, "x-url-params": "participant=P1" })
    ).json()) as SessionResponse;
    const p2 = (await (
      await send("shared", "/session", {}, { "x-link-secret": panel, "x-url-params": "participant=P2" })
    ).json()) as SessionResponse;
    expect(new Set([a.sessionId, p1.sessionId, p2.sessionId]).size).toBe(3);
    // One cookie for all of it
    expect(devices.get("shared")!.cookies.size).toBe(1);
  });

  it("knows a deployment by one spelling only", async () => {
    for (const id of ["DEMOSTUDY001", "demostudy001.Preview", "demostudy001.preview.preview", "demostudy001 "]) {
      const res = await server.request(`/api/d/${id}/session`, {
        headers: { "x-annotinder": "1", "x-link-secret": "demo-secret" },
      });
      expect(res.status).toBe(404);
    }
  });

  it("sets no cookie when the link is refused", async () => {
    const res = await send("nobody", "/session", {}, { "x-link-secret": "wrong" });
    expect(res.status).toBe(404);
    expect(res.headers.getSetCookie()).toEqual([]);
  });
});

describe("URL parameters", () => {
  it("start only with them (fitting their values), and keep them as $session values", async () => {
    await redeploy({}, [
      sessionItem({
        invite: { mode: "crowd", coderParam: { param: "PROLIFIC_PID", pattern: "[0-9a-f]{4}" } },
        urlParams: [
          { name: "study", param: "STUDY_ID" },
          { name: "src", values: [{ value: "panel" }, { value: "mail" }] },
          { name: "wave", pattern: "[0-9]", default: "1" },
        ],
      }),
    ]);
    const start = (device: string, params: string) =>
      send(device, "/session", {}, { "x-link-secret": "demo-secret", "x-url-params": params });

    const missing = await start("u1", "PROLIFIC_PID=ab12&src=panel");
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({
      code: "url_param_missing",
      error: expect.stringContaining("STUDY_ID"),
    });
    const invalid = await start("u2", "PROLIFIC_PID=xyz&STUDY_ID=s1&src=panel");
    expect(await invalid.json()).toMatchObject({ code: "url_param_invalid" });
    expect((await (await start("u3", "PROLIFIC_PID=ab12&STUDY_ID=s1&src=web")).json()) as object).toMatchObject({
      code: "url_param_invalid",
    });
    // Values are at most 256 characters, with or without a pattern
    expect(
      (await (await start("u5", `PROLIFIC_PID=ab12&STUDY_ID=${"s".repeat(300)}&src=mail`)).json()) as object,
    ).toMatchObject({ code: "url_param_invalid" });

    const okRes = await start("u4", "PROLIFIC_PID=ab12&STUDY_ID=s1&src=mail&source=newsletter&other=x");
    const ok = (await okRes.json()) as SessionResponse;
    expect(okRes.status, JSON.stringify(ok)).toBe(200);
    expect(ok.session).toEqual({ coder: "ab12", study: "s1", src: "mail", wave: "1", source: "newsletter" });
    // The same link again (the client sends the page's parameters with every request): the same session
    const again = (await (await start("u4", "PROLIFIC_PID=ab12&STUDY_ID=s1&src=mail")).json()) as SessionResponse;
    expect(again.sessionId).toBe(ok.sessionId);
    // Kept without the other parameters, also after a restart (the coder id is part of the device's session key)
    useServer(restart());
    expect(
      ((await (await send("u4", "/session", {}, { "x-url-params": "PROLIFIC_PID=ab12" })).json()) as SessionResponse)
        .session,
    ).toEqual(ok.session);
    const coders = (await listOf("coders")) as CoderProgress[];
    expect(coders.find((c) => c.coder === "ab12")?.session, JSON.stringify(coders)).toEqual({
      coder: "ab12",
      study: "s1",
      src: "mail",
      wave: "1",
      source: "newsletter",
    });
  });
});

describe("the coder's display", () => {
  it("is recorded when it changes, with when; the same again isn't; at most 100", async () => {
    const c = coder("screen");
    const post = (entry: object) => c.call("/display", { method: "POST", body: JSON.stringify(entry) });
    expect((await post({ keys: "numbers", width: "narrow" })).status).toBe(204);
    await post({ keys: "numbers", width: "narrow" });
    await post({ keys: "numpad", width: "wide" });
    expect((await post({ keys: "" })).status).toBe(400);
    const progress = async () => ((await listOf("coders")) as CoderProgress[])[0];
    expect((await progress()).display).toEqual([
      { keys: "numbers", width: "narrow", at: expect.any(String) },
      { keys: "numpad", width: "wide", at: expect.any(String) },
    ]);
    for (let i = 0; i < 120; i++) await post({ keys: i % 2 ? "letters" : "numbers" });
    expect((await progress()).display).toHaveLength(100);
  });
});

describe("the coder's id from the URL", () => {
  it("is $session.coder; optional: a link without it starts without one", async () => {
    await redeploy({}, [crowd(undefined, { coderParam: { param: "PID", optional: true } })]);
    const start = (device: string, params: string) =>
      send(device, "/session", {}, { "x-link-secret": "demo-secret", "x-url-params": params });
    expect(((await (await start("o1", "PID=abc")).json()) as SessionResponse).session).toEqual({ coder: "abc" });
    const without = await start("o2", "");
    expect(without.status).toBe(200);
    expect(((await without.json()) as SessionResponse).session).toEqual({});
    // Required (the default): refused without it
    await redeploy({}, [crowd(undefined, { coderParam: { param: "PID" } })]);
    expect(await (await start("o3", "")).json()).toMatchObject({ code: "url_param_missing" });
  });
});

describe("coder-level answers", () => {
  it("are answer rows without a unit, one per question, assigned values marked; only changed answers are written", async () => {
    const group = {
      type: "experiment",
      name: "group",
      variable: { type: "experiment", draw: "random", options: [{ value: "a" }, { value: "b" }] },
    };
    const age = { type: "question", name: "age", variable: { type: "numeric", question: "Age?" } };
    const city = {
      type: "question",
      name: "city",
      variable: { type: "nominal", question: "City?", options: [{ value: "Utrecht" }, { value: "Gent" }] },
    };
    await redeploy({}, [group, age, city]);
    const c = coder("surveyed");
    await c.session();
    expect((await c.call("/experiment/group", { method: "POST" })).status).toBe(200);
    const post = (variables: object) =>
      c.call("/variables/coder", { method: "POST", body: JSON.stringify({ variables }) });
    const value = (v: string | number) => ({ done: true, skip: false, values: [{ value: v }] });
    expect((await post({ age: value(30), city: value("Utrecht") })).status).toBe(204);
    expect((await post({ age: value(31), city: value("Utrecht") })).status).toBe(204);

    const rows = await query<{
      variable: string;
      unit_id: number | null;
      assigned: boolean;
      created: Date;
      updated: Date;
      device_id: number | null;
    }>(
      db,
      "SELECT variable, unit_id, assigned, created, updated, device_id FROM annotation_values WHERE unit_id IS NULL ORDER BY variable",
    );
    expect(rows.map((r) => [r.variable, r.assigned])).toEqual([
      ["age", false],
      ["city", false],
      ["group", true],
    ]);
    const [ageRow, cityRow] = rows;
    expect(ageRow.updated.getTime()).toBeGreaterThanOrEqual(cityRow.updated.getTime()); // only age was written again
    expect(cityRow.created.getTime()).toBe(cityRow.updated.getTime());
    expect(ageRow.device_id).not.toBeNull();

    // In the download too, without a unit; and on the coder
    const page = (await (await server.request("/api/study/1/annotations", { headers: adminHeaders })).json()) as {
      annotations: { unitId: number | null; variable: string; assigned: boolean }[];
    };
    expect(
      page.annotations
        .filter((a) => a.unitId === null)
        .map((a) => a.variable)
        .sort(),
    ).toEqual(["age", "city", "group"]);
    const coders = (await listOf("coders")) as CoderProgress[];
    expect(coders[0].variables).toMatchObject({ age: value(31), city: value("Utrecht") });
    // A reload (a restart of the runtime) reads them back
    useServer(restart());
    expect((await c.session()).variables).toMatchObject({ age: value(31) });
  });
});

describe("response times", () => {
  it("store the browser's timing per answer, and when the server first handed out the unit", async () => {
    const age = { type: "question", name: "age", variable: { type: "numeric", question: "Age?" } };
    await redeploy({}, [age]);
    const c = coder("timed");
    await c.session();
    const timing = (ms: number) => ({ firstMs: ms, totalMs: ms + 500, hiddenMs: 0, edits: 1 });
    const value = (v: number) => ({ done: true, skip: false, values: [{ value: v }] });
    const post = (body: object) => c.call("/variables/coder", { method: "POST", body: JSON.stringify(body) });
    expect((await post({ variables: { age: value(30) }, timings: { age: timing(2000) } })).status).toBe(204);
    // Looked at again, not changed: only the timing is updated
    expect((await post({ variables: { age: value(30) }, timings: { age: timing(3000) } })).status).toBe(204);

    const unit = await c.next();
    expect(
      (
        await c.call("/variables/unit", {
          method: "POST",
          body: JSON.stringify({
            unitId: unit!.id,
            variables: sentiment("positive"),
            timings: { sentiment: timing(4000), other: timing(1) },
          }),
        })
      ).status,
    ).toBe(200);

    const page = (await (await server.request("/api/study/1/annotations", { headers: adminHeaders })).json()) as {
      annotations: { unitId: number | null; variable: string; timing: unknown; servedAt: string | null }[];
    };
    const byVariable = Object.fromEntries(page.annotations.map((a) => [a.variable, a]));
    expect(byVariable.age).toMatchObject({ timing: timing(3000), servedAt: null });
    expect(byVariable.sentiment).toMatchObject({ timing: timing(4000), servedAt: expect.any(String) });
    expect(byVariable.other).toBeUndefined();
    // A bad timing is refused
    expect(
      (
        await post({
          variables: { age: value(30) },
          timings: { age: { firstMs: -1, totalMs: 0, hiddenMs: 0, edits: 0 } },
        })
      ).status,
    ).toBe(400);
  });
});

describe("limits", () => {
  it("a study past its owner's limit on coders takes no new ones; existing coders go on", async () => {
    const first = coder("first");
    await first.session();
    const owner = await ensureUser(db, "owner@uni.nl");
    await query(db, "UPDATE users SET limits = $1 WHERE id = $2", [JSON.stringify({ codersPerStudy: 1 }), owner.id]);
    await query(db, "UPDATE studies SET owner_id = $1 WHERE id = 1", [owner.id]);
    const refused = await coder("second").call("/session");
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "study_full" });
    expect((await first.call("/session")).status).toBe(200);
  });
});

describe("names that every object has (constructor, toString)", () => {
  const start = (device: string, params: string) =>
    send(device, "/session", {}, { "x-link-secret": "demo-secret", "x-url-params": params });

  it("as URL parameters are missing until the link carries them", async () => {
    await redeploy({}, [
      sessionItem({
        invite: { mode: "crowd", coderParam: { param: "constructor" } },
        urlParams: [{ name: "wave", param: "__proto__" }],
      }),
    ]);
    const without = await start("n1", "");
    expect(without.status).toBe(400);
    expect(await without.json()).toMatchObject({ code: "url_param_missing" });
    const res = await start("n2", "constructor=ab12&__proto__=2");
    expect(res.status).toBe(200);
    expect(((await res.json()) as SessionResponse).session).toEqual({ coder: "ab12", wave: "2" });
  });

  it("as a question: a unit isn't finished without its answer", async () => {
    await redeploy({
      children: [
        { type: "layout", template: "" },
        sentimentQuestion,
        { type: "question", name: "toString", variable: { type: "numeric", question: "How many?" } },
      ],
    });
    const c = coder("n3");
    const unit = (await c.next())!;
    const unfinished = await c.submit(unit.id, sentiment("positive"));
    expect(unfinished.status).toBe(400);
    expect(await unfinished.json()).toMatchObject({ error: expect.stringContaining("toString") });
    const finished = await c.call("/variables/unit", {
      method: "POST",
      body: `{"unitId":${unit.id},"variables":{"sentiment":{"done":true,"values":[{"value":"positive"}]},"toString":{"done":true,"values":[{"value":2}]}}}`,
    });
    expect(finished.status, await finished.clone().text()).toBe(200);
  });

  it("as an experiment: its value is drawn", async () => {
    await redeploy({}, [
      {
        type: "experiment",
        name: "valueOf",
        variable: { type: "experiment", draw: "balanced", options: [{ value: "a" }, { value: "b" }] },
      },
    ]);
    expect(await reach(coder("n4"), "valueOf")).toEqual([{ value: "a" }]);
    expect(await reach(coder("n5"), "valueOf")).toEqual([{ value: "b" }]);
  });

  it("as a timing without an answer: nothing is written", async () => {
    await redeploy({}, [{ type: "question", name: "age", variable: { type: "numeric", question: "Age?" } }]);
    const c = coder("n6");
    await c.session();
    forgetStoreCalls();
    const res = await c.call("/variables/coder", {
      method: "POST",
      body: JSON.stringify({
        variables: {},
        timings: { constructor: { firstMs: 1, totalMs: 2, hiddenMs: 0, edits: 1 } },
      }),
    });
    expect(res.status, await res.clone().text()).toBe(204);
    expect(storeCalls).not.toContain("putCoderValues");
  });

  it("as a deployment setting of an end item: still warned about while it has no URL", async () => {
    const end = { type: "end", name: "done", outcome: "complete", redirectSetting: "toString" };
    const deployed = await redeploy({}, [end]);
    expect(deployed.warnings?.join(" ")).toContain("'toString'");
  });
});

describe("auto questions", () => {
  const value = (v: string) => ({ done: true, skip: false, values: [{ value: v }] });

  it("are assigned when reached, once; coders who never reach them don't count", async () => {
    const condition = {
      type: "experiment",
      name: "condition",
      variable: { type: "experiment", draw: "balanced", options: [{ value: "a" }, { value: "b" }] },
    };
    await redeploy({}, [condition]);
    // Loading the session assigns nothing: a coder screened out before the question doesn't count
    const early = coder("early");
    expect((await early.session()).variables.condition).toBeUndefined();
    expect(await reach(coder("first"), "condition")).toEqual([{ value: "a" }]);
    expect(await reach(coder("first", null), "condition")).toEqual([{ value: "a" }]); // the same, reached again
    expect(await reach(coder("second"), "condition")).toEqual([{ value: "b" }]);
    expect(await reach(early, "condition")).toEqual([{ value: "a" }]);
    expect((await coder("x").call("/experiment/nope", { method: "POST" })).status).toBe(404);
  });

  it("balance within groups of earlier answers or session values (stratified)", async () => {
    const gender = {
      type: "question",
      name: "gender",
      variable: { type: "nominal", question: "Gender?", options: [{ value: "f" }, { value: "m" }] },
    };
    const condition = {
      type: "experiment",
      name: "condition",
      variable: {
        type: "experiment",
        draw: "balanced",
        options: [{ value: "a" }, { value: "b" }],
        stratify: ["gender", "session.wave"],
      },
    };
    await redeploy({}, [
      sessionItem({ urlParams: [{ name: "wave", values: [{ value: "1" }, { value: "2" }], default: "1" }] }),
      gender,
      condition,
    ]);
    const start = async (name: string, g: string, wave = "1") => {
      const c = coder(name);
      await send(name, "/session", {}, { "x-link-secret": "demo-secret", "x-url-params": `wave=${wave}` });
      await c.call("/variables/coder", { method: "POST", body: JSON.stringify({ variables: { gender: value(g) } }) });
      return reach(c, "condition");
    };
    // Women and men are balanced separately: each group starts with a
    expect(await start("w1", "f")).toEqual([{ value: "a" }]);
    expect(await start("m1", "m")).toEqual([{ value: "a" }]);
    expect(await start("w2", "f")).toEqual([{ value: "b" }]);
    expect(await start("m2", "m")).toEqual([{ value: "b" }]);
    // ... and per wave
    expect(await start("w3", "f", "2")).toEqual([{ value: "a" }]);
    // A stratify name that is no question before it, or no session value: an issue
    const bad = await server.request("/api/study/1/design", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        items: [{ ...condition, variable: { ...condition.variable, stratify: ["later", "session.nope"] } }, gender],
      }),
    });
    expect(((await bad.json()) as { valid: boolean }).valid).toBe(false);
  });
});

describe("options from data", () => {
  it("checks an answer against the options as the coder saw them: here an earlier span question's spans", async () => {
    await redeploy({
      layout: { template: "$unit.headline" },
      children: [
        { type: "layout", template: "$unit.headline" },
        {
          type: "question",
          name: "actors",
          variable: { type: "span", question: "?", options: [{ value: "person" }], fields: ["headline"] },
        },
        {
          type: "question",
          name: "politician",
          variable: {
            type: "nominal",
            question: "?",
            options: [{ value: "none" }],
            optionsFrom: { from: "$var.actors" },
          },
        },
      ],
    });
    const c = coder("spans");
    const unit = (await c.next())!;
    const slice = { offset: 0, length: 1, text: (unit.data.headline as string).slice(0, 1) };
    const answers = (politician: string) => ({
      actors: { done: true, spans: [{ id: "s1", field: "headline", value: "person", slices: [slice] }] },
      politician: { done: true, values: [{ value: politician }] },
    });
    expect((await c.submit(unit.id, answers("nobody"))).status).toBe(400);
    expect((await c.submit(unit.id, answers("s1"))).status).toBe(200);
    expect((await c.submit(unit.id, answers("none"))).status).toBe(200);
  });
});

describe("frozen answers", () => {
  it("an answer a unit loop depends on can't change once the coder coded a unit there", async () => {
    const role = {
      type: "question",
      name: "role",
      variable: { type: "nominal", question: "Role?", options: [{ value: "student" }, { value: "expert" }] },
    };
    const age = { type: "question", name: "age", variable: { type: "numeric", question: "Age?" } };
    await redeploy({ layout: { template: "As {{$var.role.label}}:" } }, [role, age]);
    const c = coder("freezer");
    await c.session();
    const value = (v: string | number) => ({ done: true, skip: false, values: [{ value: v }] });
    const post = (variables: object) =>
      c.call("/variables/coder", { method: "POST", body: JSON.stringify({ variables }) });
    expect((await post({ role: value("student"), age: value(30) })).status).toBe(204);
    expect((await c.session()).frozen).toEqual([]);

    const unit = await c.next();
    expect((await c.submit(unit!.id, sentiment("positive"))).status).toBe(200);
    expect((await c.session()).frozen).toEqual(["role"]);
    // A change is ignored; one the loop doesn't depend on is stored
    expect((await post({ role: value("expert"), age: value(31) })).status).toBe(204);
    expect((await c.session()).variables).toMatchObject({ role: value("student"), age: value(31) });
  });
});

describe("pausing a study", () => {
  it("lets coders save what they have, gives no new units or sessions, and doesn't reload coders", async () => {
    const c = coder("working");
    const [first, second] = await c.batch(2);
    const before = (await c.session()).version;
    const deployment = (await (await server.request("/api/study/1/deployment", { headers: adminHeaders })).json()) as {
      designVersionId: number;
    };
    const pause = (active: boolean) =>
      server.request("/api/study/1/deployment", {
        method: "PUT",
        headers: adminHeaders,
        body: JSON.stringify({ designVersionId: deployment.designVersionId, active }),
      });
    await pause(false);
    expect((await c.session()).version).toBe(before); // no reload for coders
    // What they have open is saved
    expect((await c.submit(first.id, demo("neutral"))).status).toBe(200);
    expect((await c.submit(second.id, demo("neutral"))).status).toBe(200);
    // No new units, no new sessions
    const next = await c.call("/loop/loop_1/next");
    expect(next.status).toBe(409);
    expect(await next.json()).toMatchObject({ code: "study_paused" });
    const newcomer = await coder("newcomer").call("/session");
    expect(newcomer.status).toBe(409);
    expect(await newcomer.json()).toMatchObject({ code: "study_paused" });
    // Resumed: they go on
    await pause(true);
    expect((await c.next())?.externalId).toBe("unit-3");
    expect((await coder("newcomer").call("/session")).status).toBe(200);
  });
});

describe("unit fields in the design", () => {
  it("keeps the session and public info next to the items, not among them", async () => {
    const session = { urlParams: [{ name: "wave", values: [{ value: "1" }] }] };
    const post = (body: object) =>
      server.request("/api/study/1/design", { method: "POST", headers: adminHeaders, body: JSON.stringify(body) });
    expect((await post({ items: [{ type: "session", ...session }] })).status).toBe(400);
    const created = (await (await post({ items: [], session })).json()) as {
      id: number;
      items: unknown[];
      session: unknown;
    };
    expect(created).toMatchObject({ items: [], session });
    // A write without `session` keeps it; `public` without: kept, null: removed
    const put = async (body: object) =>
      (await (
        await server.request(`/api/study/1/design/${created.id}`, {
          method: "PUT",
          headers: adminHeaders,
          body: JSON.stringify(body),
        })
      ).json()) as { session: unknown };
    expect((await put({ items: [] })).session).toEqual(session);
    expect((await put({ items: [], session: {} })).session).toEqual({});
    expect(((await put({ items: [], public: { title: "News" } })) as unknown as { public: unknown }).public).toEqual({
      title: "News",
    });
    expect(((await put({ items: [] })) as unknown as { public: unknown }).public).toEqual({ title: "News" });
    expect(((await put({ items: [], public: null })) as unknown as { public: unknown }).public).toBeNull();
  });

  it("are declared by uploads in the draft design, kept by codebook writes, and required to deploy", async () => {
    const { data } = await draftUnit((await unitByExternalId("unit-1")).id);
    const upload = await server.request("/api/study/1/units", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ units: [{ externalId: "with-extra", data: { ...data, source: "wire" } }] }),
    });
    expect(upload.status, await upload.clone().text()).toBe(201);
    // The deployed version is frozen: the new field goes into a new draft
    const list = (await listOf("design")) as {
      id: number;
      note: string | null;
    }[];
    const draft = list.at(-1)!;
    expect(draft.note).toBe("Unit fields from an upload");
    const get = async (id: number) =>
      (await (await server.request(`/api/study/1/design/${id}`, { headers: adminHeaders })).json()) as {
        items: unknown[];
        units: { fields: { name: string; type: string }[] };
      };
    expect((await get(draft.id)).units.fields).toContainEqual({ name: "source", type: "text" });
    // A write without `units` keeps them
    const items = (await get(draft.id)).items;
    await server.request(`/api/study/1/design/${draft.id}`, {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ items }),
    });
    expect((await get(draft.id)).units.fields.map((f) => f.name)).toContain("source");
    // A design using a field it doesn't declare can't be deployed
    const created = await server.request("/api/study/1/design", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        session: { invite: { mode: "crowd" } },
        items: [
          {
            type: "unit_loop",
            id: "loop_1",
            units: {},
            children: [{ type: "layout", template: "$unit.nowhere" }, sentimentQuestion],
          },
        ],
      }),
    });
    const { id } = (await created.json()) as { id: number };
    const deploy = await server.request("/api/study/1/deployment", {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ designVersionId: id }),
    });
    expect(deploy.status).toBe(400);
    expect(await deploy.json()).toMatchObject({ code: "undeclared_fields" });

    // Declared on the Units page (PUT /units/fields): then it deploys. Removing an unused field drops it from the draft units.
    const putFields = (fields: object[]) =>
      server.request("/api/study/1/units/fields", {
        method: "PUT",
        headers: adminHeaders,
        body: JSON.stringify({ fields }),
      });
    const fields = (await get(id)).units.fields;
    expect((await putFields([...fields, { name: "nowhere", type: "number" }])).status).toBe(200);
    expect(
      (
        await server.request("/api/study/1/deployment", {
          method: "PUT",
          headers: adminHeaders,
          body: JSON.stringify({ designVersionId: id }),
        })
      ).status,
    ).toBe(200);
    const unit = await unitByExternalId("with-extra");
    expect((await draftUnit(unit.id)).data.source).toBe("wire");
    const kept = [...fields.filter((f) => f.name !== "source"), { name: "nowhere", type: "number" }];
    expect((await putFields(kept)).status).toBe(200);
    expect((await draftUnit(unit.id)).data).not.toHaveProperty("source");
    // A field the design uses can't be removed; a value that doesn't fit a new type stops a retype
    expect((await putFields(kept.filter((f) => f.name !== "nowhere"))).status).toBe(409);
    expect((await putFields(kept.map((f) => (f.name === "text" ? { ...f, type: "number" } : f)))).status).toBe(400);
  });
});

describe("unit fields", () => {
  it("$unit.id is each unit's id, sent only when the layout uses it", async () => {
    await redeploy({ layout: { template: "# $unit.id" } });
    const unit = (await coder("ids").next())!;
    expect(unit.data).toEqual({ id: unit.externalId });
  });
});
