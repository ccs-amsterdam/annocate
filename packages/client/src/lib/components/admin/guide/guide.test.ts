import { describe, expect, it } from "vitest";
import { deployErrors, designItems, inviteKind, sessionItem } from "@annotinder/contracts";
import { findItem } from "../../../codebook/tree";
import { helpLink } from "../../../help/topicText";
import { helpTopic } from "../../../help/topics";
import { GUIDE_FLOW, GUIDE_SECTIONS, sectionIndexOf } from "./guideSteps";
import { parseGuideSection } from "./parseGuide";
import { sampleClient, sampleDesign } from "./sampleStudy";
import { closeGuide, endShowMe, goTo, guidePosition, openGuide, startShowMe } from "./guideStore";

// The components' sources: "Show me" names elements by their `data-guide` attribute
const sources = Object.values(
  import.meta.glob("../../**/*.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>,
).join("\n");
const TABS = ["Overview", "Design", "Units", "Coders", "Deploy", "Links", "Results", "Settings", "Preview"];
const steps = GUIDE_FLOW.map((f) => f.step);
const step = (id: string) => steps.find((s) => s.id === id)!;

const FRONT = "---\ntitle: Design\npage: Design\norder: 2\n---\n";
const parse = (text: string) => parseGuideSection(FRONT + text, "design.md");

describe("a section's Markdown file", () => {
  it("is a section with a step per heading: its id, what it shows, where Show me goes, and its text", () => {
    const section = parse(
      [
        "<!-- A note on the format: not a step. -->",
        "## The tree {#tree}",
        "<!-- show: design, focus: tree, select: topic; show me: Design / add-item / Add item: a question, and more -->",
        "- The coder's **path**.",
        "- Click an item.",
        "",
        "## Trying it {#try}",
        "<!-- show me: Design / preview / Preview -->",
        "One line.",
        "## The units {#units}",
        "<!-- show: units -->",
        "Rows.",
        "## Only text {#text}",
        "Words.",
      ].join("\n"),
    );
    expect(section).toMatchObject({ title: "Design", page: "Design", order: 2 });
    expect(section.steps).toEqual([
      {
        id: "tree",
        title: "The tree",
        body: "- The coder's **path**.\n- Click an item.",
        sample: { show: "design", focus: "tree", select: "topic" },
        showMe: { page: "Design", target: "add-item", label: "Add item: a question, and more" },
      },
      {
        id: "try",
        title: "Trying it",
        body: "One line.",
        showMe: { page: "Design", target: "preview", label: "Preview" },
      },
      { id: "units", title: "The units", body: "Rows.", sample: { show: "units" } },
      { id: "text", title: "Only text", body: "Words." },
    ]);
  });

  it("says what is wrong, and where", () => {
    expect(() => parseGuideSection("## A {#a}\nText", "x.md")).toThrow("x.md: the front matter needs a title");
    expect(() => parse("Only a note")).toThrow("design.md: no steps");
    expect(() => parse("## No id\nText")).toThrow('"## No id" needs an id');
    expect(() => parse("## A {#a}\n<!-- show: units -->\n")).toThrow("design.md #a: the step has no text");
    expect(() => parse("## A {#a}\n<!-- show: design -->\nText")).toThrow("#a: focus is one of overview, tree");
    expect(() => parse("## A {#a}\n<!-- show: unit -->\nText")).toThrow("#a: show is design or one of map, units");
    expect(() => parse("## A {#a}\n<!-- show: units, focus: tree -->\nText")).toThrow('go with "show: design"');
    expect(() => parse("## A {#a}\n<!-- show: design, focus: tree, item: x -->\nText")).toThrow('unknown "item"');
    expect(() => parse("## A {#a}\n<!-- show me: Nowhere / x / Label -->\nText")).toThrow("#a: show me is");
    expect(() => parse("## A {#a}\n<!-- show me: Design / x -->\nText")).toThrow("#a: show me is");
    expect(() => parse("## A {#a}\n<!-- note -->\nText")).toThrow('starts with "show:" or "show me:"');
  });
});

describe("the guide's steps", () => {
  it("go from the start through the design to the other pages, each section its page's", () => {
    expect(GUIDE_SECTIONS.map((s) => [s.title, s.page, s.steps.map((st) => st.id)])).toEqual([
      ["Start", "Overview", ["start"]],
      ["Design", "Design", ["designer", "tree", "item-editor", "modes", "coder-questions", "unit-loop", "branch"]],
      ["Units", "Units", ["units"]],
      ["Coders", "Coders", ["add-coders", "coder-set", "coders-table"]],
      ["Trying it", "Preview", ["preview"]],
      ["Deploying", "Deploy", ["deploy"]],
      ["Links", "Links", ["links"]],
      ["Results", "Results", ["results"]],
    ]);
    expect(new Set(GUIDE_SECTIONS.map((s) => s.page)).size).toBe(GUIDE_SECTIONS.length);
  });

  it("have unique ids; a page without a section opens the start", () => {
    expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length);
    expect(GUIDE_SECTIONS[sectionIndexOf("Units")].page).toBe("Units");
    expect(sectionIndexOf("Settings")).toBe(0);
  });

  it("show items of the sample study, a design with expert coders that could be deployed", () => {
    const items = designItems(sampleDesign());
    expect(deployErrors(items)).toEqual([]);
    expect(inviteKind(sessionItem(items)!.invite!)).toBe("expert");
    for (const s of steps) {
      if (s.sample?.show !== "design" || !s.sample.select || s.sample.select === "session") continue;
      expect(findItem(items, s.sample.select), `${s.id}: ${s.sample.select}`).not.toBeNull();
    }
  });

  it("show the editor from the whole to its parts, the item editor with a simple question", () => {
    expect(step("designer").sample).toEqual({ show: "design", focus: "overview", select: "topic" });
    expect(step("tree").sample).toMatchObject({ focus: "tree" });
    expect(step("item-editor").sample).toEqual({ show: "design", focus: "item", select: "news_use" });
    expect(step("modes").sample).toEqual({ show: "design", focus: "form", select: "session" });
  });

  it("point at elements that are there (`data-guide`)", () => {
    for (const s of steps) {
      if (!s.showMe) continue;
      const { target } = s.showMe;
      const found = target.startsWith("tab-")
        ? TABS.includes(target.slice(4)) && sources.includes("data-guide={`tab-${")
        : sources.includes(`data-guide="${target}"`) || sources.includes(`guide="${target}"`);
      expect(found, `${s.id}: ${target}`).toBe(true);
    }
  });

  it("link to help topics that are there", () => {
    for (const s of steps) {
      for (const [, href] of s.body.matchAll(/\]\(([^)]+)\)/g)) {
        const link = helpLink(href, "");
        expect(link && helpTopic(link.slug), `${s.id}: ${href}`).toBeTruthy();
      }
    }
  });

  it("have a section for the Coders page, its Show me on that page", () => {
    const coders = GUIDE_SECTIONS[sectionIndexOf("Coders")];
    expect(coders.steps.map((s) => s.showMe?.page)).toEqual(["Coders", "Coders", "Coders"]);
  });

  it("say where who codes is chosen and where coders are followed, as the app has it", () => {
    expect(step("modes").body).toContain("Who codes");
    expect(step("modes").body).toContain("first deploy");
    expect(step("modes").body).toContain("Coders page");
    expect(step("modes").body).not.toContain("Settings");
    expect(step("results").body).toContain("Coders page");
  });
});

describe("the sample study's API", () => {
  it("isn't deployed: who codes is its design's choice", async () => {
    expect((await sampleClient().getStudy(1))?.coderKind).toBeNull();
    expect((await sampleClient().getDesignVersion(sampleDesign().id)).session.invite?.mode).toBe("coders");
  });

  it("answers from memory and refuses writes", async () => {
    const client = sampleClient();
    expect((await client.listUnitPage({ offset: 0, limit: 2 })).units).toHaveLength(2);
    expect((await client.listCoders()).coders.map((c) => c.coder)).toEqual(["anna", "bob", "carla"]);
    await expect(client.deleteUnit(1)).rejects.toThrow("can't be changed");
  });
});

describe("the guide's place", () => {
  it("opens a page's section where it was last in it (this session); Show me goes back there", () => {
    const design = sectionIndexOf("Design");
    goTo({ section: design, step: 2 });
    closeGuide();
    openGuide("Units");
    expect(guidePosition()).toEqual({ section: sectionIndexOf("Units"), step: 0 });
    openGuide("Design");
    expect(guidePosition()).toEqual({ section: design, step: 2 });
    startShowMe({ target: "who-codes", label: "Who codes" });
    expect(guidePosition()).toBeNull();
    endShowMe(true);
    expect(guidePosition()).toEqual({ section: design, step: 2 });
    // A named step wins: "Learn more about who codes" opens this one
    openGuide("Design", "modes");
    expect(GUIDE_SECTIONS[design].steps[guidePosition()!.step].id).toBe("modes");
    closeGuide();
  });
});
