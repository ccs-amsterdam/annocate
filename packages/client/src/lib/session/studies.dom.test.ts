// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { continueUrl, loadStudies, rememberStudy } from "./studies";

const STORAGE_KEY = "annotinder:studies";
const remembered = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as { deployment: string }[];

const summary = (deployment: string) => ({
  deployment,
  title: `Study ${deployment}`,
  started: "2026-01-01T10:00:00Z",
  lastActive: "2026-01-02T10:00:00Z",
  ended: null,
  units: 3,
});

/** A server with these answers by path (a status, or a JSON body); the requests it got. */
function server(answers: Record<string, number | object>) {
  const requests: { url: string; headers: Record<string, string> }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    requests.push({ url, headers: init.headers as Record<string, string> });
    const answer = answers[url] ?? 404;
    return typeof answer === "number" ? new Response("{}", { status: answer }) : Response.json(answer);
  });
  return requests;
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe("the studies this browser opened", () => {
  it("are remembered most recent first, a study opened again once", () => {
    rememberStudy({ deployment: "aaa", params: {} });
    rememberStudy({ deployment: "bbb", params: {} });
    rememberStudy({ deployment: "aaa", params: {} });
    expect(remembered().map((s) => s.deployment)).toEqual(["aaa", "bbb"]);
  });

  it("a study opened with other URL parameters is another session (the coder id is part of its key)", () => {
    rememberStudy({ deployment: "aaa", params: { pid: "1" } });
    rememberStudy({ deployment: "aaa", params: { pid: "2" } });
    expect(remembered()).toHaveLength(2);
  });

  it("at most 50 are kept: the oldest go", () => {
    for (let i = 0; i < 55; i++) rememberStudy({ deployment: `d${i}`, params: {} });
    expect(remembered()).toHaveLength(50);
    expect(remembered()[0].deployment).toBe("d54");
  });

  it("what is stored but is no list of studies counts as none", async () => {
    localStorage.setItem(STORAGE_KEY, '{"not":"a list"}');
    const requests = server({});
    expect(await loadStudies("/api")).toEqual([]);
    expect(requests.map((r) => r.url)).toEqual(["/api/coder/sessions"]);
    localStorage.setItem(STORAGE_KEY, "not json");
    rememberStudy({ deployment: "aaa", params: {} });
    expect(remembered()).toHaveLength(1);
  });
});

describe("where a study continues", () => {
  it("its page with its URL parameters, never a link's secret", () => {
    expect(continueUrl({ deployment: "a/b", params: {}, elsewhere: false })).toBe("/code/a%2Fb");
    expect(continueUrl({ deployment: "aaa", params: { pid: "p 7" }, elsewhere: false })).toBe("/code/aaa?pid=p+7");
  });

  it("a session of the login on another device: with the choice to code with the account", () => {
    expect(continueUrl({ deployment: "aaa", params: {}, elsewhere: true })).toBe("/code/aaa?login=1");
    expect(continueUrl({ deployment: "aaa", params: { pid: "7" }, elsewhere: true })).toBe("/code/aaa?pid=7&login=1");
  });
});

describe("loading the studies for the coder's overview", () => {
  it("asks each study for its summary, with its URL parameters", async () => {
    rememberStudy({ deployment: "aaa", params: { pid: "7" } });
    const requests = server({ "/api/d/aaa/summary": summary("aaa") });
    const studies = await loadStudies("/api");
    expect(studies).toHaveLength(1);
    expect(studies[0]).toMatchObject({ deployment: "aaa", params: { pid: "7" }, elsewhere: false });
    expect(studies[0].study.title).toBe("Study aaa");
    expect(studies[0].study.started).toBeInstanceOf(Date);
    expect(requests[0].headers).toEqual({ "x-annotinder": "1", "x-url-params": "pid=7" });
  });

  it("forgets a study the server has no session for (404), but not one that failed to load", async () => {
    rememberStudy({ deployment: "gone", params: {} });
    rememberStudy({ deployment: "down", params: {} });
    rememberStudy({ deployment: "aaa", params: {} });
    server({ "/api/d/gone/summary": 404, "/api/d/down/summary": 503, "/api/d/aaa/summary": summary("aaa") });
    const studies = await loadStudies("/api");
    expect(studies.map((s) => s.deployment)).toEqual(["aaa"]);
    expect(remembered().map((s) => s.deployment)).toEqual(["aaa", "down"]);
  });

  it("keeps the studies when there is no connection: none are shown, none forgotten", async () => {
    rememberStudy({ deployment: "aaa", params: {} });
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await loadStudies("/api")).toEqual([]);
    expect(remembered()).toHaveLength(1);
  });

  it("adds a logged-in coder's sessions on other devices, not those this browser has too", async () => {
    rememberStudy({ deployment: "aaa", params: {} });
    server({
      "/api/d/aaa/summary": summary("aaa"),
      "/api/coder/sessions": [summary("aaa"), summary("bbb")],
    });
    const studies = await loadStudies("/api");
    expect(studies.map((s) => [s.deployment, s.elsewhere])).toEqual([
      ["aaa", false],
      ["bbb", true],
    ]);
    // (Not remembered here: this browser has no session for it)
    expect(remembered().map((s) => s.deployment)).toEqual(["aaa"]);
  });

  it("leaves out a summary that isn't one", async () => {
    rememberStudy({ deployment: "aaa", params: {} });
    server({ "/api/d/aaa/summary": { deployment: "aaa" } });
    expect(await loadStudies("/api")).toEqual([]);
    expect(remembered()).toHaveLength(1);
  });
});
