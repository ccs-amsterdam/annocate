import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpResearcherApi } from "./httpResearcherApi";

afterEach(() => vi.unstubAllGlobals());

/** A server whose GET responses are these JSON bodies, by path and query; the paths asked, in order. */
function server(responses: Record<string, unknown>): string[] {
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    asked.push(url);
    if (!(url in responses)) return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    return new Response(JSON.stringify(responses[url]), { status: 200 });
  });
  return asked;
}

describe("lists of the researcher API", () => {
  const api = new HttpResearcherApi({ baseUrl: "/api", studyId: 7 });

  it("are objects with their items: the client returns the items", async () => {
    server({ "/api/study/7/links": { links: [{ id: 1 }, { id: 2 }] }, "/api/study": { studies: [{ id: 7 }] } });
    expect(await api.listLinks()).toEqual([{ id: 1 }, { id: 2 }]);
    expect(await api.listStudies()).toEqual([{ id: 7 }]);
  });

  it("are read to the end: a response with next is followed by the page after it", async () => {
    const asked = server({
      "/api/study/7/units": { units: [{ id: 1 }, { id: 2 }], next: 2 },
      "/api/study/7/units?after=2": { units: [{ id: 3 }], next: 3 },
      "/api/study/7/units?after=3": { units: [] },
    });
    expect(await api.listUnits()).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(asked).toEqual(["/api/study/7/units", "/api/study/7/units?after=2", "/api/study/7/units?after=3"]);
  });

  it("the coders come with the units no coder has: every page's coders, and that count once", async () => {
    const unassigned = { live: 2, draft: 0 };
    const asked = server({
      "/api/study/7/coders": { coders: [{ id: 1, coder: "anna" }], next: 1, unassigned },
      "/api/study/7/coders?after=1": { coders: [{ id: 2, coder: "bob" }], unassigned },
    });
    expect(await api.listCoders()).toEqual({
      coders: [
        { id: 1, coder: "anna" },
        { id: 2, coder: "bob" },
      ],
      unassigned,
    });
    expect(asked).toEqual(["/api/study/7/coders", "/api/study/7/coders?after=1"]);
  });

  it("the coder sessions are a list of their own", async () => {
    server({ "/api/study/7/sessions": { sessions: [{ id: 5 }] } });
    expect(await api.listSessions()).toEqual([{ id: 5 }]);
  });

  it("a coder's email address is set by their coder id, whatever characters it has", async () => {
    const requests: { url: string; method?: string; body?: unknown }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      requests.push({ url, method: init?.method, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ coder: "Anna de Vries" }), { status: 200 });
    });
    await api.updateCoder("Anna de Vries", { email: null });
    expect(requests).toEqual([
      { url: "/api/study/7/coders/Anna%20de%20Vries", method: "PATCH", body: { email: null } },
    ]);
  });
});

describe("deleting for good", () => {
  const api = new HttpResearcherApi({ baseUrl: "/api" });

  /** A server that answers 204; the requests it got. */
  function deleting(): { url: string; method?: string; body?: unknown }[] {
    const requests: { url: string; method?: string; body?: unknown }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      requests.push({ url, method: init?.method, body: JSON.parse(String(init?.body)) });
      return new Response(null, { status: 204 });
    });
    return requests;
  }

  it("sends what the researcher typed to confirm: a study's name, the account's email address", async () => {
    const requests = deleting();
    await api.deleteStudy(7, "News 2026");
    await api.deleteAccount("ann@example.org");
    expect(requests).toEqual([
      { url: "/api/study/7", method: "DELETE", body: { confirm: "News 2026" } },
      { url: "/api/me", method: "DELETE", body: { confirm: "ann@example.org" } },
    ]);
  });
});

describe("a study the researcher has no role in", () => {
  it("is answered 404, like one that doesn't exist: no study", async () => {
    server({});
    expect(await new HttpResearcherApi({ baseUrl: "/api" }).getStudy(7)).toBeNull();
  });
});

describe("the login session", () => {
  const refused = () => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  it("is reported ended when the server refuses a request with the session cookie, from any study's client", async () => {
    vi.stubGlobal("fetch", async (url: string) =>
      url === "/api/auth/activity" ? new Response(null, { status: 204 }) : refused(),
    );
    const api = new HttpResearcherApi({ baseUrl: "/api" });
    const ended = vi.fn();
    const stop = api.onLoginEnded(ended);
    await api.reportActivity();
    expect(ended).not.toHaveBeenCalled();
    await expect(api.forStudy(7).listLinks()).rejects.toMatchObject({ status: 401 });
    expect(ended).toHaveBeenCalledTimes(1);
    stop();
    await expect(api.listStudies()).rejects.toMatchObject({ status: 401 });
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("isn't there with an API key or development headers: their 401 is no ended login", async () => {
    vi.stubGlobal("fetch", async () => refused());
    for (const config of [{ apiKey: "k" }, { devRole: "ADMIN" as const }]) {
      const api = new HttpResearcherApi({ baseUrl: "/api", ...config });
      const ended = vi.fn();
      api.onLoginEnded(ended);
      await expect(api.listStudies()).rejects.toMatchObject({ status: 401 });
      expect(ended).not.toHaveBeenCalled();
    }
  });
});
