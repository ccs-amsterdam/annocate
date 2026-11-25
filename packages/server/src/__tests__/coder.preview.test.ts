import { describe, expect, it } from "vitest";
import type { CoderUnitResponse, SessionResponse } from "@annotinder/contracts";
import { query } from "./testDb.js";
import { DEMO_PUBLIC_ID } from "../db/publicId.js";
import { adminHeaders, db, server, coder, sentiment, dbAnnotations, sentimentQuestion } from "./coderHarness.js";

describe("researcher preview", () => {
  const draft = async (note: string) => {
    const res = await server.request("/api/study/1/design", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        note,
        items: [
          {
            type: "unit_loop",
            id: "loop_1",
            label: note,
            children: [{ type: "layout", template: "" }, sentimentQuestion],
            units: {},
          },
        ],
      }),
    });
    expect(res.status).toBe(201);
  };
  const openPreview = async () => {
    const res = await server.request("/api/study/1/deployment/preview", { method: "POST", headers: adminHeaders });
    expect(res.status).toBe(200);
    return (await res.json()) as { deploymentId: string; token: string };
  };
  /** A browser on the preview deployment, with its own cookie. */
  const previewer = (deploymentId: string, token: string) => {
    let cookie = "";
    return async (path: string, init: RequestInit = {}) => {
      const res = await server.request(`/api/d/${deploymentId}${path}`, {
        ...init,
        headers: { "content-type": "application/json", "x-annotinder": "1", "x-link-secret": token, cookie },
      });
      const [set] = res.headers.getSetCookie();
      if (set) cookie = set.split(";")[0];
      return res;
    };
  };

  it("runs the latest design version, deployed or not, and picks up edits", async () => {
    await draft("draft 1");
    const { deploymentId, token } = await openPreview();
    expect(deploymentId).toBe(`${DEMO_PUBLIC_ID}.preview`);
    const call = previewer(deploymentId, token);
    const label = (session: SessionResponse) => (session.codebook.items[0] as { label?: string }).label;
    const previewed = (await (await call("/session")).json()) as SessionResponse;
    expect(label(previewed)).toBe("draft 1");
    // There is no signing in in a preview
    expect(previewed).toMatchObject({ signIn: "none", canLogIn: false });
    // the real deployment is untouched
    expect(label(await coder("real").session())).not.toBe("draft 1");

    await draft("draft 2");
    expect(label((await (await call("/session")).json()) as SessionResponse)).toBe("draft 2");
  });

  it("keeps the preview's coders and answers out of the database", async () => {
    await draft("draft");
    const coders = async () => (await query<{ n: number }>(db, "SELECT COUNT(*)::int AS n FROM coder_sessions"))[0].n;
    const before = await coders();
    const { deploymentId, token } = await openPreview();
    const call = previewer(deploymentId, token);
    const unit = ((await (await call("/loop/loop_1/next")).json()) as { units: CoderUnitResponse[] }).units[0];
    const submit = await call("/variables/unit", {
      method: "POST",
      body: JSON.stringify({ unitId: unit.id, variables: sentiment("neutral") }),
    });
    expect(submit.status).toBe(200);
    expect(((await (await call("/session")).json()) as SessionResponse).progress[0].doneUnitIds).toEqual([unit.id]);
    expect(await dbAnnotations()).toEqual([]);
    expect(await coders()).toBe(before);
  });

  it("refuses forged, expired and other studies' tokens", async () => {
    await draft("draft");
    const { token } = await openPreview();
    const [, , exp, sig] = token.split(".");
    const tries = [
      `preview.1.${exp}.${"0".repeat(64)}`, // forged
      `preview.1.${Date.now() - 1000}.${sig}`, // expired (and so the signature no longer matches either)
      token.replace("preview.1.", "preview.2."), // another study
    ];
    for (const t of tries) expect((await previewer(`${DEMO_PUBLIC_ID}.preview`, t)("/session")).status).toBe(401);
  });
});
