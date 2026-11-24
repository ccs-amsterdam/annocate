import { z } from "zod";

// Highlights in a unit layout (docs/client.md §3, "Highlights"): words found
// by a small query language, marked with a colour. On purpose not more than:
//
//   climate energy        either word (spaces are OR)
//   climate AND energy    both, somewhere in the searched text (AND binds tighter than OR)
//   "climate change"      the words in this order
//   "climate policy"~5    the words within 5 words of each other, any order
//   climat* *bank         a wildcard, anywhere in a word
//
// Case and accents don't count. Words are runs of letters and digits.

export const HighlightSchema = z
  .strictObject({
    query: z.string().min(1).describe('Words to mark: climate energy (or), AND, "a phrase", "near words"~5, climat*'),
    color: z.string().optional().describe("A CSS colour name or hex code (default: yellow)."),
    fields: z
      .array(z.string().min(1))
      .optional()
      .describe("Only search and mark these unit fields (default: all the layout shows)."),
  })
  .superRefine((h, ctx) => {
    const parsed = parseHighlightQuery(h.query);
    if ("error" in parsed) ctx.addIssue({ code: "custom", message: parsed.error, path: ["query"] });
  });
export type Highlight = z.infer<typeof HighlightSchema>;

/** One term: words in order (one for a word), at most `slop` words apart (any order) with ~n. */
interface Term {
  words: RegExp[];
  slop?: number;
}
/** OR of ANDs of terms. */
export type HighlightQuery = Term[][];

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** A word pattern: `*` any letters, the rest literal. */
function wordPattern(word: string): RegExp {
  const parts = fold(word)
    .split("*")
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`^${parts.join("[\\p{L}\\p{N}]*")}$`, "u");
}

/** The words of a piece of query text (letters, digits and *). */
const queryWords = (text: string) => text.match(/[\p{L}\p{N}*]+/gu) ?? [];

/** A query, or what is wrong with it. */
export function parseHighlightQuery(query: string): { query: HighlightQuery } | { error: string } {
  // Tokens: "phrases"(~n), AND, words
  const tokens: ({ t: "and" } | { t: "term"; term: Term })[] = [];
  const re = /"([^"]*)"(?:~(\d+))?|(\S+)/g;
  for (let m = re.exec(query); m; m = re.exec(query)) {
    if (m[3] !== undefined) {
      if (m[3].includes('"')) return { error: `A quote isn't closed in ${query}` };
      if (m[3] === "AND") tokens.push({ t: "and" });
      else {
        const words = queryWords(m[3]).filter((w) => w.replace(/\*/g, "") !== "");
        // Punctuation alone is no word; "co-operation" is two words in order
        if (words.length) tokens.push({ t: "term", term: { words: words.map(wordPattern) } });
      }
    } else {
      const words = queryWords(m[1]).filter((w) => w.replace(/\*/g, "") !== "");
      if (!words.length) return { error: "A phrase in quotes has no words" };
      tokens.push({
        t: "term",
        term: { words: words.map(wordPattern), ...(m[2] !== undefined ? { slop: Number(m[2]) } : {}) },
      });
    }
  }
  const groups: Term[][] = [];
  let expectTerm = false;
  for (const token of tokens) {
    if (token.t === "and") {
      if (expectTerm || groups.length === 0) return { error: "AND needs words on both sides" };
      expectTerm = true;
    } else if (expectTerm) {
      groups[groups.length - 1].push(token.term);
      expectTerm = false;
    } else groups.push([token.term]);
  }
  if (expectTerm) return { error: "AND needs words on both sides" };
  if (groups.length === 0) return { error: "Give at least one word" };
  return { query: groups };
}

/** A text's words: [start, end) and the folded word. */
function wordsOf(text: string): { start: number; end: number; word: string }[] {
  return [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    word: fold(m[0]),
  }));
}

/** Where a term matches in one text: per match the indexes of its words. */
function termMatches(term: Term, words: { word: string }[]): number[][] {
  const n = term.words.length;
  if (term.slop === undefined || n === 1) {
    const out: number[][] = [];
    for (let i = 0; i + n <= words.length; i++)
      if (term.words.every((p, k) => p.test(words[i + k].word))) out.push(Array.from({ length: n }, (_, k) => i + k));
    return out;
  }
  // Near: every word within a window of n + slop words, any order
  const span = n + term.slop;
  const out: number[][] = [];
  for (let i = 0; i < words.length; i++) {
    if (!term.words.some((p) => p.test(words[i].word))) continue;
    const window = words.slice(i, i + span);
    const found = term.words.map((p) => window.findIndex((w) => p.test(w.word)));
    // Each word found, starting at i (else the window starting at the first found word counts)
    if (found.every((f) => f >= 0) && found.includes(0)) out.push(found.map((f) => i + f));
  }
  return out;
}

/**
 * The ranges a query marks in some texts (per key: [start, end) pairs). An
 * AND holds when each of its terms matches somewhere in all the texts
 * together; then all their matches are marked.
 */
export function highlightRanges(
  query: HighlightQuery,
  texts: Record<string, string>,
): Record<string, [number, number][]> {
  const words = new Map(Object.entries(texts).map(([key, text]) => [key, wordsOf(text)]));
  const found = new Map<string, [number, number][]>();
  for (const group of query) {
    const matches = group.map((term) =>
      [...words].flatMap(([key, ws]) => termMatches(term, ws).map((m) => ({ key, m }))),
    );
    if (matches.some((m) => m.length === 0)) continue;
    for (const { key, m } of matches.flat()) {
      const ws = words.get(key)!;
      const ranges = m.map((i) => [ws[i].start, ws[i].end] as [number, number]);
      found.set(key, [...(found.get(key) ?? []), ...ranges]);
    }
  }
  return Object.fromEntries([...found].map(([key, ranges]) => [key, distinctStarts(ranges)]));
}

/** Ranges in order, one per start (the shortest). */
function distinctStarts(ranges: [number, number][]): [number, number][] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return sorted.filter((r, i) => i === 0 || r[0] !== sorted[i - 1][0]);
}
