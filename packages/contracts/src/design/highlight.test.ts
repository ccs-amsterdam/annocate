import { describe, expect, it } from "vitest";
import { HighlightSchema, highlightRanges, parseHighlightQuery, type HighlightQuery } from "./highlight.js";

const q = (query: string): HighlightQuery => {
  const parsed = parseHighlightQuery(query);
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed.query;
};
/** The marked words of each text. */
const marked = (query: string, texts: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(highlightRanges(q(query), texts)).map(([k, rs]) => [k, rs.map(([a, b]) => texts[k].slice(a, b))]),
  );

describe("highlights", () => {
  const text = "The Climate policy of the EU: climate change, and energy policy for Élysée.";

  it("marks words: spaces are or, case and accents don't count, * is a wildcard", () => {
    expect(marked("energy élysée", { t: text })).toEqual({ t: ["energy", "Élysée"] });
    expect(marked("climat*", { t: text })).toEqual({ t: ["Climate", "climate"] });
    expect(marked("*licy", { t: text })).toEqual({ t: ["policy", "policy"] });
    expect(marked("nuclear", { t: text })).toEqual({});
  });

  it('"phrases" in order; "near"~n within n words, any order', () => {
    expect(marked('"climate change"', { t: text })).toEqual({ t: ["climate", "change"] });
    expect(marked('"change climate"', { t: text })).toEqual({});
    expect(marked('"policy energy"~2', { t: text })).toEqual({ t: ["energy", "policy"] });
    expect(marked('"climate energy"~1', { t: text })).toEqual({});
  });

  it("AND: every side somewhere in the texts (fields together), tighter than or", () => {
    expect(marked("climate AND nuclear", { t: text })).toEqual({});
    expect(marked("EU AND nuclear energy", { t: text })).toEqual({ t: ["energy"] });
    expect(marked("climate AND budget", { t: text, title: "The budget" })).toEqual({
      t: ["Climate", "climate"],
      title: ["budget"],
    });
  });

  it("explains a query that can't be read", () => {
    expect(parseHighlightQuery('"climate')).toEqual({ error: "A quote isn't closed in \"climate" });
    expect(parseHighlightQuery("AND climate")).toEqual({ error: "AND needs words on both sides" });
    expect(parseHighlightQuery("climate AND")).toEqual({ error: "AND needs words on both sides" });
    expect(HighlightSchema.safeParse({ query: '""' }).success).toBe(false);
    expect(HighlightSchema.safeParse({ query: "climate", color: "gold", fields: ["text"] }).success).toBe(true);
  });
});
