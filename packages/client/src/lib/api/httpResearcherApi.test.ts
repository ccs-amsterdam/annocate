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
