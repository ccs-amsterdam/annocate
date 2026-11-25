import { describe, expect, it } from "vitest";

import {
  adminHeaders,
  server,
  restart,
  coder,
  sentiment,
  sentimentQuestion,
  redeploy,
  listOf,
  sessionItem,
  useServer,
} from "./coderHarness.js";

describe("end items", () => {
  it("end the session: the outcome is stored, and nothing more is accepted", async () => {
    const c = coder("young");
    expect((await c.session()).ended).toBeNull();
    const end = await c.call("/end", { method: "POST", body: JSON.stringify({ item: "screen_out_young" }) });
    expect(await end.json()).toEqual({ reopen: null }); // no going back after a screenout
    expect((await c.session()).ended).toMatchObject({ item: "screen_out_young", outcome: "screenout" });

    const next = await c.call("/loop/loop_1/next");
    expect(next.status).toBe(409);
    expect(await next.json()).toMatchObject({ code: "session_ended" });
    const answers = await c.call("/variables/coder", { method: "POST", body: JSON.stringify({ variables: {} }) });
    expect(answers.status).toBe(409);

    // Researchers see how the session ended.
    const coders = (await listOf("sessions")) as {
      ended: unknown;
    }[];
    expect(coders[0].ended).toMatchObject({ item: "screen_out_young", outcome: "screenout" });
  });

  it("the study's normal end (the Study entry's end): coders get it as the last item; its redirect setting is resolved", async () => {
    await server.request("/api/study/1", {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ name: "Demo study", redirectUrls: { panel: "https://panel.example/done" } }),
    });
    await redeploy({}, [sessionItem({ end: { message: "Thank you", redirectSetting: "panel" } })]);
    const c = coder("finisher");
    const items = (await c.session()).codebook.items;
    expect(items.at(-1)).toEqual({
      type: "end",
      name: "_end",
      outcome: "complete",
      message: "Thank you",
      redirectUrl: "https://panel.example/done",
    });
    const end = await c.call("/end", { method: "POST", body: JSON.stringify({ item: "_end" }) });
    expect(end.status).toBe(200);
    expect((await c.session()).ended).toMatchObject({ item: "_end", outcome: "complete" });
  });

  it("inside a unit loop: remember the unit; the closed session gets only what the end screen uses", async () => {
    // An end in the loop whose message uses a unit field and an answer
    await redeploy({
      children: [
        { type: "layout", template: "$unit.headline" },
        sentimentQuestion,
        { type: "end", name: "done_here", outcome: "complete", message: "$unit.headline: $var.sentiment.label" },
      ],
    });
    const c = coder("ender");
    const unit = await c.next();
    await c.submit(unit!.id, sentiment("neutral"));
    const bogus = await c.call("/end", {
      method: "POST",
      body: JSON.stringify({ item: "done_here", unit: { loop: "loop_1", id: 999999 } }),
    });
    expect(bogus.status).toBe(400);
    const end = await c.call("/end", {
      method: "POST",
      body: JSON.stringify({ item: "done_here", unit: { loop: "loop_1", id: unit!.id } }),
    });
    expect(await end.json()).toEqual({ reopen: { until: expect.any(String) } });
    const session = await c.session();
    expect(session.ended).toMatchObject({ unit: { loop: "loop_1", id: unit!.id } });
    expect(session.endValues).toEqual({
      variables: {},
      unit: { data: { headline: expect.any(String) }, variables: { sentiment: expect.anything() } },
    });
    expect((await c.call(`/loop/loop_1/units/${unit!.id}`)).status).toBe(409);
  });

  it("finishing without an end item ends the session too; the coder can go back for a day", async () => {
    let now = Date.now();
    useServer(restart({ now: () => now }));
    await redeploy({}, [{ type: "question", name: "age", variable: { type: "numeric", question: "Age?" } }]);
    const c = coder("finisher");
    expect(
      (
        await c.call("/variables/coder", {
          method: "POST",
          body: JSON.stringify({ variables: { age: { done: true, skip: false, values: [{ value: 30 }] } } }),
        })
      ).status,
    ).toBe(204);
    expect(await (await c.call("/end", { method: "POST", body: "{}" })).json()).toMatchObject({
      reopen: { until: expect.any(String) },
    });
    const closed = await c.session();
    expect(closed.ended).toMatchObject({ outcome: "complete" });
    expect(closed.variables).toEqual({}); // closed: none of their answers
    expect((await c.call("/reopen", { method: "POST" })).status).toBe(204);
    expect((await c.session()).variables).toMatchObject({ age: expect.anything() });

    await c.call("/end", { method: "POST", body: "{}" });
    now += 25 * 60 * 60 * 1000;
    expect((await c.session()).reopen).toBeNull();
    expect((await c.call("/reopen", { method: "POST" })).status).toBe(409);
  });

  it("a study can keep finished sessions open", async () => {
    await server.request("/api/study/1", {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ name: "Demo", reopenMinutes: null }),
    });
    await redeploy({});
    const c = coder("keeper");
    const unit = await c.next();
    await c.submit(unit!.id, sentiment("neutral"));
    await c.call("/end", { method: "POST", body: "{}" });
    expect((await c.session()).reopen).toEqual({ until: null });
    expect((await c.call(`/loop/loop_1/units/${unit!.id}`)).status).toBe(200);
  });

  it("only for end items of the design", async () => {
    const res = await coder("other").call("/end", { method: "POST", body: JSON.stringify({ item: "consent" }) });
    expect(res.status).toBe(400);
  });
});
