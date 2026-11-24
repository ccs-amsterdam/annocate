import { describe, expect, it } from "vitest";
import { deployErrors, designItems } from "@annotinder/contracts";
import { findItem } from "../../../codebook/tree";
import { GUIDE_FLOW, GUIDE_SECTIONS, sectionIndexOf } from "./guideSteps";
import { sampleClient, sampleDesign } from "./sampleStudy";
import { closeGuide, endShowMe, goTo, guidePosition, openGuide, startShowMe } from "./guideStore";

// The components' sources: "Show me" names elements by their `data-guide` attribute
const sources = Object.values(
  import.meta.glob("../../**/*.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>,
).join("\n");
const TABS = ["Overview", "Design", "Units", "Deploy", "Links", "Results", "Settings", "Preview"];
const steps = GUIDE_FLOW.map((f) => f.step);

describe("the guide's steps", () => {
  it("have unique ids; a page without a section opens the designer's", () => {
    expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length);
    expect(GUIDE_SECTIONS[sectionIndexOf("Units")].page).toBe("Units");
    expect(sectionIndexOf("Settings")).toBe(0);
  });

  it("show items of the sample study, a design that could be deployed (with a crowd or expert coders)", () => {
    for (const invite of ["crowd", "coders"] as const) {
      const items = designItems(sampleDesign(invite));
      expect(deployErrors(items)).toEqual([]);
      for (const s of steps) {
        if (s.sample?.page !== "design" || !s.sample.select || s.sample.select === "session") continue;
        expect(findItem(items, s.sample.select), s.sample.select).not.toBeNull();
      }
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
    expect((await client.getDesignVersion(sampleDesign().id)).session.invite).toEqual({ mode: "crowd" });
    expect((await client.listUnitPage({ offset: 0, limit: 2 })).units).toHaveLength(2);
    await expect(client.deleteUnit(1)).rejects.toThrow("can't be changed");
  });
});

describe("the guide's place", () => {
  it("opens a page's section where it was last in it (this session); Show me goes back there", () => {
    goTo({ section: 0, step: 2 });
    closeGuide();
    openGuide("Units");
    expect(guidePosition()).toEqual({ section: sectionIndexOf("Units"), step: 0 });
    openGuide("Design");
    expect(guidePosition()).toEqual({ section: 0, step: 2 });
    startShowMe({ target: "who-codes", label: "Who codes" });
    expect(guidePosition()).toBeNull();
    endShowMe(true);
    expect(guidePosition()).toEqual({ section: 0, step: 2 });
    // A named step wins
    openGuide("Design", "crowd");
    expect(GUIDE_SECTIONS[0].steps[guidePosition()!.step].id).toBe("crowd");
    closeGuide();
  });
});
