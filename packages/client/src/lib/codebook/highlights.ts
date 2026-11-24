import { highlightRanges, parseHighlightQuery, type Highlight } from "@annotinder/contracts";
import type { TemplateValue } from "./renderTemplate";

/** A marked piece of a value's text: [start, end) and its colour. */
export interface Mark {
  start: number;
  end: number;
  color: string;
}

/** Marks per template value (by its index). */
export type Marks = Record<number, Mark[]>;

export const DEFAULT_HIGHLIGHT_COLOR = "gold";

/** A mark's background: the colour, light enough to read the text on it in either theme. */
export const markBackground = (color: string) => `color-mix(in srgb, ${color} 45%, transparent)`;

/**
 * What a layout's highlights mark (docs/client.md §3, "Highlights"): each
 * query over the unit fields the layout shows as text and its named text
 * blocks (or only its `fields`), together; a word marked by several takes
 * the first one's colour.
 */
export function layoutMarks(highlights: readonly Highlight[] | undefined, values: readonly TemplateValue[]): Marks {
  const marks: Marks = {};
  for (const h of highlights ?? []) {
    const parsed = parseHighlightQuery(h.query);
    if ("error" in parsed) continue;
    const texts: Record<string, string> = {};
    values.forEach((v, i) => {
      // Unit fields (`unit.text`, matched as `text`) and named text blocks; not answers (`var.`)
      if (!v.field || v.suffix !== "text" || v.field.startsWith("var.")) return;
      const name = v.field.replace(/^unit\./, "");
      if (!h.fields || h.fields.includes(name)) texts[i] = v.text;
    });
    const color = h.color ?? DEFAULT_HIGHLIGHT_COLOR;
    for (const [key, ranges] of Object.entries(highlightRanges(parsed.query, texts))) {
      const list = (marks[Number(key)] ??= []);
      for (const [start, end] of ranges)
        if (!list.some((m) => m.start < end && m.end > start)) list.push({ start, end, color });
    }
  }
  for (const list of Object.values(marks)) list.sort((a, b) => a.start - b.start);
  return marks;
}

/** A text cut at its marks: the pieces, each with its mark's colour or none. */
export function markedPieces(text: string, marks: readonly Mark[]): { text: string; color?: string }[] {
  const pieces: { text: string; color?: string }[] = [];
  let at = 0;
  for (const m of marks) {
    if (m.start > at) pieces.push({ text: text.slice(at, m.start) });
    pieces.push({ text: text.slice(m.start, m.end), color: m.color });
    at = m.end;
  }
  if (at < text.length) pieces.push({ text: text.slice(at) });
  return pieces;
}
