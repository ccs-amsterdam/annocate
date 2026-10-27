import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { HELP_SECTIONS, HELP_TOPICS, headingId, helpLink, helpTopic, parseFrontMatter } from "./topics";
import { validateCodebookItems } from "@annotinder/contracts";
import { exampleCodebook, exampleScope, parseExample } from "./example";
import { renderTemplate } from "../codebook/renderTemplate";
import { parseHelpTarget } from "./helpStore";

/** The ids of a topic's headings, as HelpContent gives them. */
function headingIds(body: string): Set<string> {
  const html = renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>);
  return new Set([...html.matchAll(/<h[23]>(.*?)<\/h[23]>/g)].map((m) => headingId(m[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"'))));
}

/** The client's sources, which open topics with `HelpButton topic="…"`, `openHelp("…")` and topic maps. */
const sources = import.meta.glob(["../**/*.{ts,tsx}", "!../**/*.test.*", "!./**"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

describe("help topics", () => {
  it("each have a title, a known section and a summary", () => {
    expect(HELP_TOPICS.length).toBeGreaterThan(0);
    for (const t of HELP_TOPICS) {
      expect(t.title, t.slug).toBeTruthy();
      expect(HELP_SECTIONS, t.slug).toContain(t.section);
      expect(t.summary, t.slug).toBeTruthy();
    }
  });

  it("link to topics and headings that exist", () => {
    const problems: string[] = [];
    for (const t of HELP_TOPICS) {
      for (const [, href] of t.body.matchAll(/\]\(([^)\s]+)\)/g)) {
        const link = helpLink(href, t.slug);
        if (!link) continue;
        const target = helpTopic(link.slug);
        if (!target) problems.push(`${t.slug}: no topic ${link.slug}`);
        else if (link.anchor && !headingIds(target.body).has(link.anchor)) problems.push(`${t.slug}: no heading #${link.anchor} in ${link.slug}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("are opened from the UI only with topics and headings that exist", () => {
    const problems: string[] = [];
    expect(Object.keys(sources).length).toBeGreaterThan(10);
    for (const [file, source] of Object.entries(sources)) {
      for (const [, target] of source.matchAll(/(?:topic=|openHelp\()"([^"]+)"/g)) {
        const { slug, anchor } = parseHelpTarget(target);
        const topic = helpTopic(slug);
        if (!topic) problems.push(`${file}: no topic ${slug}`);
        else if (anchor && !headingIds(topic.body).has(anchor)) problems.push(`${file}: no heading #${anchor} in ${slug}`);
      }
      // Topic maps (AdminApp's TAB_HELP): `Name: "slug"` entries
      for (const block of source.matchAll(/_HELP[^=]*=\s*\{([^}]*)\}/g)) {
        for (const [, slug] of block[1].matchAll(/:\s*"([^"]+)"/g)) if (!helpTopic(parseHelpTarget(slug).slug)) problems.push(`${file}: no topic ${slug}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("have examples that are valid templates, and render", async () => {
    const problems: string[] = [];
    for (const t of HELP_TOPICS) {
      for (const [, source] of t.body.matchAll(/```example\n([\s\S]*?)```/g)) {
        const data = parseExample(source);
        for (const issue of validateCodebookItems(exampleCodebook(data))) if (!issue.warning) problems.push(`${t.slug}: ${issue.message}\n${data.template}`);
        const scope = exampleScope(data, Object.fromEntries(Object.entries(data.answers).map(([q, a]) => [q, a[0]])));
        const rendered = await renderTemplate(data.template, scope, undefined, "help", {
          snippets: data.snippets,
          ...(data.steps.length ? { progress: { current: data.steps[0], order: data.steps } } : {}),
        });
        if (/:::/.test(rendered.markdown)) problems.push(`${t.slug}: a block fence is shown\n${data.template}`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe("help examples", () => {
  it("read unit data, answers with alternatives, multi-line snippets and steps", () => {
    const data = parseExample(
      ["unit:", "  headline: Storm", "  likes: 12", "answers:", "  group: a | b | -", "snippets:", "  note: |", "    line one", "", "    line two", "steps: topic, tone", "---", "# $unit.headline"].join("\n"),
    );
    expect(data.unit).toEqual({ headline: "Storm", likes: 12 });
    expect(data.answers).toEqual({ group: ["a", "b", null] });
    expect(data.snippets).toEqual({ note: "line one\n\nline two" });
    expect(data.steps).toEqual(["topic", "tone"]);
    expect(data.template).toBe("# $unit.headline");
    const scope = exampleScope(data, { group: "b" });
    expect(scope.$var.group).toMatchObject({ value: "b", label: "b" });
    expect(exampleScope(data, { group: null }).$var.group).toMatchObject({ value: null });
  });

  it("are all template without a header", () => {
    expect(parseExample("Just $unit.text").template).toBe("Just $unit.text");
  });
});

describe("front matter", () => {
  it("splits off the meta block", () => {
    expect(parseFrontMatter("---\ntitle: A: b\norder: 2\n---\nBody")).toEqual({ meta: { title: "A: b", order: "2" }, body: "Body" });
  });
});
