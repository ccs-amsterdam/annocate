// Formats JSON for the codebook editor's JSON views (docs/client.md §7):
// indented like JSON.stringify(value, null, 2), except that small objects and
// arrays of plain values stay on one line when they fit, e.g. an option
// `{ "value": "neg", "label": "Negative" }` or `"items": ["a", "b"]`.

const INDENT = "  ";
export const LINE_WIDTH = 100;

const isPlain = (v: unknown) => v === null || typeof v !== "object";

/**
 * Keys in reading order: the database (JSONB) returns them sorted by
 * length, so `{ "color", "label", "value" }`. These come first, in this
 * order; `children` last; the rest as they are.
 */
const FIRST_KEYS = ["name", "type", "value", "label", "item", "color", "weight", "source", "question", "instruction"];

function entriesOf(value: object): [string, unknown][] {
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  const rank = (key: string) => {
    if (key === "children") return FIRST_KEYS.length + 1;
    const i = FIRST_KEYS.indexOf(key);
    return i === -1 ? FIRST_KEYS.length : i;
  };
  return entries.map((e, i) => [e, i] as const).sort((a, b) => rank(a[0][0]) - rank(b[0][0]) || a[1] - b[1]).map(([e]) => e);
}

/** One line, with spaces as people write it: `{ "a": 1, "b": [1, 2] }`. */
function oneLine(value: unknown): string {
  if (isPlain(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(oneLine).join(", ")}]`;
  const entries = entriesOf(value as object);
  return entries.length === 0 ? "{}" : `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${oneLine(v)}`).join(", ")} }`;
}

const isEmpty = (v: unknown) => typeof v === "object" && v !== null && Object.keys(v).length === 0;

/** Whether a value may go on one line: its contents are plain values or empty. */
function isSmall(value: unknown): boolean {
  if (isPlain(value)) return true;
  const values = Array.isArray(value) ? value : Object.values(value as object);
  return values.every((v) => isPlain(v) || isEmpty(v));
}

function format(value: unknown, depth: number, prefixLength: number): string {
  if (isPlain(value)) return JSON.stringify(value);
  const pad = INDENT.repeat(depth);
  const flat = oneLine(value);
  if (isSmall(value) && pad.length + prefixLength + flat.length <= LINE_WIDTH) return flat;
  const inner = INDENT.repeat(depth + 1);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((v) => inner + format(v, depth + 1, 0)).join(",\n")}\n${pad}]`;
  }
  const entries = entriesOf(value as object);
  if (entries.length === 0) return "{}";
  const lines = entries.map(([k, v]) => {
    const key = `${JSON.stringify(k)}: `;
    return inner + key + format(v, depth + 1, key.length);
  });
  return `{\n${lines.join(",\n")}\n${pad}}`;
}

/** The value as JSON, compact where small (see above). */
export function formatJson(value: unknown): string {
  return format(value, 0, 0);
}
