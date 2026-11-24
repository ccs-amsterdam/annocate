import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deployErrors, designItems } from "@annotinder/contracts";
import { findItem } from "../../../codebook/tree";
import { GUIDE_TOPICS, topicForPage } from "./guideSteps";
import { SAMPLE_DESIGN, sampleClient } from "./sampleStudy";
import { closeGuide, endShowMe, fullGuideProgress, openGuide, setGuide, startShowMe } from "./guideStore";

// The components' sources: "Show me" names elements by their `data-guide` attribute
const sources = Object.values(
  import.meta.glob("../../**/*.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>,
).join("\n");
const TABS = ["Overview", "Design", "Units", "Deploy", "Links", "Results", "Settings", "Preview"];

const steps = GUIDE_TOPICS.flatMap((t) => t.steps);

describe("the guide's steps", () => {
  it("go to topics that exist, and every page has one", () => {
    expect(new Set(GUIDE_TOPICS.map((t) => t.id)).size).toBe(GUIDE_TOPICS.length);
    for (const jump of steps.flatMap((s) => s.jumps ?? []))
      expect(GUIDE_TOPICS.map((t) => t.id)).toContain(jump.topic);
    for (const page of ["Design", "Units", "Deploy", "Links", "Results", "Preview"] as const)
      expect(topicForPage(page)).not.toBe(undefined);
  });

  it("show items of the sample study, a valid design that could be deployed", () => {
    const items = designItems(SAMPLE_DESIGN);
    expect(deployErrors(items)).toEqual([]);
    for (const s of steps) {
      if (s.sample?.page !== "design" || !s.sample.select || s.sample.select === "session") continue;
      expect(findItem(items, s.sample.select), s.sample.select).not.toBeNull();
    }
  });

  it("point at elements that are there (`data-guide`)", () => {
    for (const s of steps) {
      if (!s.showMe) continue;
      const { target } = s.showMe;
      const found = target.startsWith("tab-")
        ? TABS.includes(target.slice(4)) && sources.includes("data-guide={`tab-${")
        : sources.includes(`data-guide="${target}"`) || sources.includes(`guide="${target}"`);
      expect(found, target).toBe(true);
    }
  });
});

describe("the sample study's API", () => {
  it("answers from memory and refuses writes", async () => {
    const client = sampleClient();
    expect((await client.getDesignVersion(SAMPLE_DESIGN.id)).id).toBe(SAMPLE_DESIGN.id);
    expect((await client.listUnitPage({ offset: 0, limit: 2 })).units).toHaveLength(2);
    await expect(client.deleteUnit(1)).rejects.toThrow("can't be changed");
  });
});

describe("the full guide's progress", () => {
  const stored = new Map<string, string>();
  beforeEach(() => {
    stored.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => stored.get(k) ?? null,
      setItem: (k: string, v: string) => void stored.set(k, v),
      removeItem: (k: string) => void stored.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is remembered in this browser until the guide is finished", () => {
    openGuide(undefined, { full: true });
    expect(fullGuideProgress()).toEqual({ topic: GUIDE_TOPICS[0].id, step: 0 });
    setGuide({ topic: "units", step: 0, full: true });
    // Show me keeps it; so does closing
    startShowMe({ target: "upload-units", label: "Upload" });
    endShowMe(true);
    closeGuide();
    expect(fullGuideProgress()).toEqual({ topic: "units", step: 0 });
    // Opening it again continues there, unless from the start
    openGuide(undefined, { full: true, fromStart: true });
    expect(fullGuideProgress()).toEqual({ topic: GUIDE_TOPICS[0].id, step: 0 });
    closeGuide(true);
    expect(fullGuideProgress()).toBeNull();
  });

  it("isn't touched by a page's topic", () => {
    openGuide("units");
    expect(fullGuideProgress()).toBeNull();
    closeGuide();
  });
});
