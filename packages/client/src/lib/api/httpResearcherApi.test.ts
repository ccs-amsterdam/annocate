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
