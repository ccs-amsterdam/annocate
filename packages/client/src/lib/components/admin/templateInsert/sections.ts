import { Code2, Eye, Heading1, Image, Paintbrush, Puzzle, Text, type LucideIcon } from "lucide-react";

/** Text inside a Monaco snippet: `$`, `}` and `\` are literal. */
const literal = (text: string) => text.replace(/[\\$}]/g, (c) => `\\${c}`);
/** A block around the selection (or an empty line for the cursor). */
export const block = (fence: string) => `${literal(fence)}\n\${TM_SELECTED_TEXT}$0\n:::`;
/** A line of its own, with the cursor after it. */
const line = (text: string) => `${literal(text)}\n$0`;

const STYLES: { label: string; css: string }[] = [
  { label: "Box", css: "border: 1px solid var(--border); border-radius: 8px; padding: 0.75em 1em" },
  { label: "Small grey text", css: "color: var(--muted-foreground); font-size: 90%" },
  { label: "Large text", css: "font-size: 120%" },
  { label: "Centered", css: "text-align: center" },
  { label: "Custom CSS…", css: "property: value" },
];

/** Something to insert: how it shows in the menu and the Monaco snippet it writes. */
export interface InsertEntry {
  icon: LucideIcon;
  label: string;
  detail?: string;
  snippet: string;
}

export type SectionKey = "headline" | "text" | "image" | "snippet" | "from" | "style";

/** A part of the Insert menu: its line in the menu, and what it lists once opened. */
export interface InsertSection {
  key: SectionKey;
  icon: LucideIcon;
  label: string;
  detail: string;
  /** Above the list. */
  title: string;
  /** Shown when there is nothing to list. */
  empty?: string;
  entries: InsertEntry[];
}

/** What a loop's template can use. */
export interface InsertSources {
  /** The unit fields. */
  fields: string[];
  /** The loop's questions. */
  loopQuestions: string[];
  /** The loop's snippets. */
  snippets: string[];
}

/** Names to pick from, each with the snippet it inserts. */
const named = (names: string[], snippet: (name: string) => string): InsertEntry[] =>
  names.map((name) => ({ icon: Code2, label: name, snippet: snippet(name) }));

const NO_FIELDS = "This study's units have no fields yet: upload units first.";

/** The sections of the Insert menu, for what this loop has. */
export function insertSections({ fields, loopQuestions, snippets }: InsertSources): Record<SectionKey, InsertSection> {
  const field = { title: "Which field?", empty: NO_FIELDS };
  return {
    headline: {
      key: "headline",
      icon: Heading1,
      label: "Headline",
      detail: "a unit field as a heading",
      ...field,
      entries: named(fields, (f) => `# ${line(`$unit.${f}`)}`),
    },
    text: {
      key: "text",
      icon: Text,
      label: "Text",
      detail: "a unit field (span questions can select in it)",
      ...field,
      entries: named(fields, (f) => line(`$unit.${f}`)),
    },
    image: {
      key: "image",
      icon: Image,
      label: "Image",
      detail: "a unit field with an image URL",
      ...field,
      entries: named(fields, (f) => line(`$unit.${f}::image`)),
    },
    snippet: {
      key: "snippet",
      icon: Puzzle,
      label: "Snippet",
      detail: "a named piece of this layout",
      title: "Which snippet?",
      empty: "This loop has no snippets yet: add them below the template.",
      entries: named(snippets, (n) => line(`[[${n}]]`)),
    },
    from: {
      key: "from",
      icon: Eye,
      label: "Show from…",
      detail: "from a question of the loop on",
      title: "From which question?",
      empty: "This loop has no questions yet.",
      entries: named(loopQuestions, (q) => block(`::: from ${q}`)),
    },
    style: {
      key: "style",
      icon: Paintbrush,
      label: "Style…",
      detail: "colours, size, a box",
      title: "Style",
      entries: STYLES.map((s) => ({
        icon: Paintbrush,
        label: s.label,
        detail: s.css,
        snippet: block(`::: style ${s.css}`),
      })),
    },
  };
}
