import type { VariableValue } from "../variableValue.js";
import type { AnyVariableType } from "./answers.js";

// One reference syntax for scripts, templates, question texts and condition
// rules (docs/client.md "References and conditions"):
//
//   $unit.<field>                 a unit data column (inside a unit loop)
//   $const.<name>                 a layout constant (inside a unit loop)
//   $var.<q>.code / .value        code / numeric value of question q
//   $var.<q>.<item>.code / .value one item of a scale with `items`
//   $var.<q>.text                 selected texts (span questions)
//   $var.<q>.answered             true if answered and not skipped
//
// Names are always literal, so what a codebook refers to (and where) can be
// checked without running anything. All functions here are pure, shared by
// the client runtime, codebook validation and the admin editor.

export type ReferenceNamespace = "unit" | "var" | "const";

/** How a template value is output (`$ref::markdown`); `text` is the default. */
export const OUTPUT_SUFFIXES = ["text", "markdown", "image", "tokenize"] as const;
export type OutputSuffix = (typeof OUTPUT_SUFFIXES)[number];

/** `$var` properties; item names may not use these. */
export const VAR_PROPERTIES = ["code", "value", "text", "answered"] as const;
export type VarProperty = (typeof VAR_PROPERTIES)[number];

export interface Reference {
  ns: ReferenceNamespace;
  /** `["headline"]` for `$unit.headline`, `["interest", "tech", "value"]` for `$var.interest.tech.value`. */
  path: string[];
  /** Template output suffix (`::markdown`), if given. */
  suffix?: OutputSuffix;
  /** Offsets in the source: `source.slice(start, end)` is the reference (including the suffix). */
  start: number;
  end: number;
}

export interface ReferenceError {
  message: string;
  start: number;
  end: number;
}

export interface ExtractedReferences {
  references: Reference[];
  errors: ReferenceError[];
}

const NAME = /[A-Za-z0-9_]/;
const IDENT_CHAR = /[A-Za-z0-9_$]/;
const NAMESPACES: ReferenceNamespace[] = ["unit", "var", "const"];

/** The source text of a reference, e.g. `$var.role.code`. */
export function referenceText(ref: Pick<Reference, "ns" | "path">): string {
  return `$${ref.ns}.${ref.path.join(".")}`;
}

/**
 * Reads one reference starting at `source[at] === "$"`. Returns null if this
 * `$` doesn't start one (e.g. `$foo`, or `a$var` in a script). Only the segments that
 * make up the reference are consumed: `$unit.x.length` in a script is the
 * reference `$unit.x` followed by ordinary JS.
 */
function readReference(
  source: string,
  at: number,
  template: boolean,
): { ref?: Reference; error?: ReferenceError; end: number } | null {
  // In a script, `a$var` and `x.$var` are ordinary identifiers; in a template, `part_$var.slot.code` is a reference.
  if (!template && at > 0 && (IDENT_CHAR.test(source[at - 1]) || source[at - 1] === ".")) return null;
  const ns = NAMESPACES.find((n) => source.startsWith(n, at + 1) && !IDENT_CHAR.test(source[at + 1 + n.length] ?? ""));
  if (!ns) return null;
  let pos = at + 1 + ns.length;

  const segment = () => {
    if (source[pos] !== "." || !NAME.test(source[pos + 1] ?? "")) return null;
    let end = pos + 1;
    while (end < source.length && NAME.test(source[end])) end++;
    const name = source.slice(pos + 1, end);
    pos = end;
    return name;
  };
  const fail = (message: string) => ({ error: { message, start: at, end: pos }, end: pos });

  const first = segment();
  if (first === null) {
    if (source[pos] === "[") return fail(`Names after $${ns} must be literal ($${ns}.name), not computed ($${ns}[...])`);
    return fail(`$${ns} must be followed by a name ($${ns}.name)`);
  }
  const path = [first];
  if (ns === "var") {
    const second = segment();
    if (second === null) return fail(`$var.${first} needs a property: .code, .value, .text or .answered`);
    path.push(second);
    if (!(VAR_PROPERTIES as readonly string[]).includes(second)) {
      // An item of a scale question: $var.q.item.code
      const third = segment();
      if (third !== "code" && third !== "value") {
        return fail(`$var.${first}.${second} needs a property: .code or .value (for items), or use .code, .value, .text or .answered`);
      }
      path.push(third);
    }
  }
  if (source[pos] === "[") return fail(`Names in ${referenceText({ ns, path })}[...] must be literal, not computed`);

  let suffix: OutputSuffix | undefined;
  if (template && source.startsWith("::", pos)) {
    const match = /^::([A-Za-z]+)/.exec(source.slice(pos));
    const name = match?.[1];
    if (name && (OUTPUT_SUFFIXES as readonly string[]).includes(name)) {
      suffix = name as OutputSuffix;
      pos += 2 + name.length;
    } else if (name) {
      pos += 2 + name.length;
      return fail(`Unknown output '::${name}' (use ::text, ::markdown, ::image or ::tokenize)`);
    }
  }
  return { ref: { ns, path, suffix, start: at, end: pos }, end: pos };
}

/**
 * References in a script (a JS expression). String literals and comments are
 * skipped. A computed or bare namespace (`$var[x]`, `Object.keys($var)`) is
 * an error: names must be literal so they can be checked.
 */
export function extractReferences(script: string, offset = 0): ExtractedReferences {
  const result: ExtractedReferences = { references: [], errors: [] };
  scanScript(script, 0, script.length, result, null);
  if (offset !== 0) {
    for (const r of [...result.references, ...result.errors]) {
      r.start += offset;
      r.end += offset;
    }
  }
  return result;
}

/** Scans `source[from, to)` as JS code; returns where it stopped (at `to`, or at an unmatched `}` if `stopAtBrace`). */
function scanScript(
  source: string,
  from: number,
  to: number,
  out: ExtractedReferences,
  stopAtBrace: { depth: number } | null,
): number {
  let i = from;
  while (i < to) {
    const c = source[i];
    if (c === "/" && source[i + 1] === "/") {
      while (i < to && source[i] !== "\n") i++;
    } else if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? to : end + 2;
    } else if (c === '"' || c === "'") {
      i++;
      while (i < to && source[i] !== c && source[i] !== "\n") i += source[i] === "\\" ? 2 : 1;
      i++;
    } else if (c === "`") {
      i++;
      while (i < to && source[i] !== "`") {
        if (source[i] === "\\") i += 2;
        else if (source[i] === "$" && source[i + 1] === "{") i = scanScript(source, i + 2, to, out, { depth: 0 }) + 1;
        else i++;
      }
      i++;
    } else if (c === "$") {
      const read = readReference(source, i, false);
      if (!read) {
        i++;
        continue;
      }
      if (read.ref) out.references.push(read.ref);
      if (read.error) out.errors.push(read.error);
      i = Math.max(read.end, i + 1);
    } else if (stopAtBrace && c === "{") {
      stopAtBrace.depth++;
      i++;
    } else if (stopAtBrace && c === "}") {
      if (stopAtBrace.depth === 0) return i;
      stopAtBrace.depth--;
      i++;
    } else {
      i++;
    }
  }
  return i;
}

// ---- templates ---------------------------------------------------------------

/** A value in a template: a bare `$ref` or a `{{ script }}`, with its output suffix. */
export interface TemplateExpression {
  type: "expression";
  /** The script to evaluate; for a bare `$ref` this is the reference itself (`$ref` ≡ `{{$ref}}`). */
  script: string;
  /** Set for a bare `$ref` (not for `{{ }}`). */
  ref?: Reference;
  /** References in the script (for a bare ref: just that one). */
  references: Reference[];
  suffix: OutputSuffix;
  /** Whether the expression stands alone on its line (rendered as a block). */
  alone: boolean;
  start: number;
  end: number;
}

export type TemplateSegment = { type: "text"; text: string } | TemplateExpression;

export interface ParsedTemplate {
  segments: TemplateSegment[];
  errors: ReferenceError[];
}

/**
 * Splits a template (the unit layout, a question or instruction text, a
 * unitset name) into literal text and expressions. Syntax: `$unit.x`,
 * `$var.q.code`, `$const.y` or `{{ js }}`, each with an optional
 * `::text|markdown|image|tokenize` suffix. `\$` is a literal `$`; references
 * inside markdown code spans and fences stay literal.
 */
export function parseTemplate(source: string): ParsedTemplate {
  const segments: TemplateSegment[] = [];
  const errors: ReferenceError[] = [];
  let text = "";
  let i = 0;
  const literal = new Set<number>();
  for (const [s, e] of codeRanges(source)) for (let k = s; k < e; k++) literal.add(k);

  const push = (expr: Omit<TemplateExpression, "type" | "alone">) => {
    if (text) segments.push({ type: "text", text });
    text = "";
    segments.push({ type: "expression", ...expr, alone: aloneOnLine(source, expr.start, expr.end) });
  };

  while (i < source.length) {
    const c = source[i];
    if (literal.has(i)) {
      text += c;
      i++;
    } else if (c === "\\" && source[i + 1] === "$") {
      // Leave the escape in: markdown renders `\$` as `$`.
      text += "\\$";
      i += 2;
    } else if (c === "{" && source[i + 1] === "{") {
      const close = source.indexOf("}}", i + 2);
      if (close === -1) {
        errors.push({ message: "Unclosed {{", start: i, end: source.length });
        text += source.slice(i);
        break;
      }
      const script = source.slice(i + 2, close);
      let end = close + 2;
      let suffix: OutputSuffix = "text";
      const match = /^::([A-Za-z]+)/.exec(source.slice(end));
      if (match) {
        if ((OUTPUT_SUFFIXES as readonly string[]).includes(match[1])) suffix = match[1] as OutputSuffix;
        else errors.push({ message: `Unknown output '::${match[1]}' (use ::text, ::markdown, ::image or ::tokenize)`, start: end, end: end + match[0].length });
        end += match[0].length;
      }
      const extracted = extractReferences(script, i + 2);
      errors.push(...extracted.errors);
      if (!script.trim()) errors.push({ message: "Empty {{ }}", start: i, end });
      push({ script: script.trim(), references: extracted.references, suffix, start: i, end });
      i = end;
    } else if (c === "$") {
      const read = readReference(source, i, true);
      if (!read) {
        text += c;
        i++;
        continue;
      }
      if (read.error) {
        errors.push(read.error);
        text += source.slice(i, read.end);
      } else if (read.ref) {
        const ref = read.ref;
        push({ script: referenceText(ref), ref, references: [ref], suffix: ref.suffix ?? "text", start: ref.start, end: ref.end });
      }
      i = Math.max(read.end, i + 1);
    } else {
      text += c;
      i++;
    }
  }
  if (text) segments.push({ type: "text", text });
  return { segments, errors };
}

/** All references in a template, including those inside `{{ }}`. */
export function templateReferences(source: string): ExtractedReferences {
  const parsed = parseTemplate(source);
  return {
    references: parsed.segments.flatMap((s) => (s.type === "expression" ? s.references : [])),
    errors: parsed.errors,
  };
}

function aloneOnLine(source: string, start: number, end: number): boolean {
  const lineStart = source.lastIndexOf("\n", start - 1) + 1;
  let lineEnd = source.indexOf("\n", end);
  if (lineEnd === -1) lineEnd = source.length;
  return source.slice(lineStart, start).trim() === "" && source.slice(end, lineEnd).trim() === "";
}

/** [start, end) ranges of markdown code fences and inline code spans. */
function codeRanges(source: string): [number, number][] {
  const ranges: [number, number][] = [];
  // Fences: a line starting with ``` or ~~~ up to a closing fence (or the end)
  const fence = /^ {0,3}(`{3,}|~{3,})[^\n]*$/gm;
  let match: RegExpExecArray | null;
  const fenced: [number, number][] = [];
  while ((match = fence.exec(source))) {
    const marker = match[1];
    const closing = new RegExp(`^ {0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}[ \\t]*$`, "gm");
    closing.lastIndex = match.index + match[0].length;
    const close = closing.exec(source);
    const end = close ? close.index + close[0].length : source.length;
    fenced.push([match.index, end]);
    fence.lastIndex = end;
  }
  ranges.push(...fenced);
  const inFence = (k: number) => fenced.some(([s, e]) => k >= s && k < e);
  // Inline code: a backtick run up to the next run of the same length
  for (let i = 0; i < source.length; i++) {
    if (source[i] !== "`" || inFence(i) || (i > 0 && source[i - 1] === "\\")) continue;
    let n = 0;
    while (source[i + n] === "`") n++;
    const run = "`".repeat(n);
    let search = i + n;
    let close = -1;
    while ((search = source.indexOf(run, search)) !== -1) {
      if (source[search + n] !== "`" && source[search - 1] !== "`") {
        close = search;
        break;
      }
      search += n;
    }
    if (close === -1) {
      i += n - 1;
      continue;
    }
    ranges.push([i, close + n]);
    i = close + n - 1;
  }
  return ranges;
}

// ---- shapes ------------------------------------------------------------------

export type ReferenceValueType = "string" | "number" | "boolean" | "any";

/** What a reference holds, as follows from the codebook (never from the runtime value). */
export type ReferenceShape =
  | {
      ok: true;
      /** Arrays (multi-select, spans) are `[]` when unanswered; scalars are `null`. */
      array: boolean;
      type: ReferenceValueType;
      /** The possible codes, if known. */
      codes?: string[];
      warning?: string;
    }
  | { ok: false; reason: string };

/**
 * The shape of a reference. `$var` refs are looked up in `questions`;
 * `$unit` fields are untyped here (`any`); constants are strings.
 */
export function referenceShape(questions: ReadonlyMap<string, AnyVariableType>, ref: Pick<Reference, "ns" | "path">): ReferenceShape {
  if (ref.ns === "unit") return { ok: true, array: false, type: "any" };
  if (ref.ns === "const") return { ok: true, array: false, type: "string" };
  const [name, ...rest] = ref.path;
  const variable = questions.get(name);
  if (!variable) return { ok: false, reason: `'${name}' is not a question` };
  return varShape(name, variable, rest);
}

function varShape(name: string, variable: AnyVariableType, rest: string[]): ReferenceShape {
  const property = rest[rest.length - 1] as VarProperty;
  const item = rest.length === 2 ? rest[0] : undefined;
  const label = `$var.${[name, ...rest].join(".")}`;
  if (property === "answered") {
    return item ? { ok: false, reason: `${label}: use $var.${name}.answered` } : { ok: true, array: false, type: "boolean" };
  }
  const type = variable.type;
  if (type === "confirm") return { ok: false, reason: `${label}: '${name}' is a confirm question; only .answered is available` };

  const codes = type === "auto" ? variable.options?.map((o) => o.code) : "codes" in variable ? variable.codes.map((c) => c.code) : undefined;
  const hasValues = type !== "auto" && "codes" in variable && variable.codes.some((c) => c.value !== undefined);
  const items = type === "scale" ? variable.items : undefined;

  if (property === "text") {
    if (item) return { ok: false, reason: `${label}: items have no .text` };
    if (type !== "span") return { ok: false, reason: `${label}: .text is only available for span questions` };
    return { ok: true, array: true, type: "string" };
  }

  if (items && items.length > 0) {
    if (!item) return { ok: false, reason: `${label}: '${name}' has items; use $var.${name}.<item>.${property}` };
    if (!items.some((i) => i.name === item)) return { ok: false, reason: `${label}: '${item}' is not an item of '${name}'` };
  } else if (item) {
    return { ok: false, reason: `${label}: '${name}' has no items` };
  }

  const array = type === "span" || type === "relation" || ((type === "select_code" || type === "search_code") && variable.multiple === true);
  if (property === "value") {
    if (type === "span" || type === "relation") return { ok: false, reason: `${label}: ${type} questions have no .value` };
    const warning = hasValues ? undefined : `${label}: the codes of '${name}' have no values, so this is always empty`;
    return { ok: true, array, type: "number", warning };
  }
  return { ok: true, array, type: "string", codes };
}

export interface ReferenceOption {
  /** E.g. `$var.role.code`. */
  ref: string;
  shape: Extract<ReferenceShape, { ok: true }>;
}

/**
 * The `$var` references to these questions that fit their types (no
 * errors or warnings), e.g. for a reference picker. Pass the questions
 * available at a point (validation `availableQuestions`).
 */
export function referenceOptions(questions: Iterable<{ name: string; variable: AnyVariableType }>): ReferenceOption[] {
  const options: ReferenceOption[] = [];
  for (const { name, variable } of questions) {
    const lookup = new Map([[name, variable]]);
    const items = variable.type === "scale" ? (variable.items ?? []) : [];
    const paths = [
      ...items.flatMap((item) => [[item.name, "code"], [item.name, "value"]]),
      ...VAR_PROPERTIES.map((p) => [p]),
    ];
    for (const rest of paths) {
      const ref = { ns: "var" as const, path: [name, ...rest] };
      const shape = referenceShape(lookup, ref);
      if (shape.ok && !shape.warning) options.push({ ref: referenceText(ref), shape });
    }
  }
  return options;
}

// ---- scope -------------------------------------------------------------------

export interface VarScopeEntry {
  code?: string | null | string[];
  value?: number | null | number[];
  text?: string[];
  answered: boolean;
  [item: string]: unknown;
}

export interface ReferenceScope {
  $unit: Record<string, unknown>;
  $var: Record<string, VarScopeEntry>;
  $const: Record<string, unknown>;
}

/**
 * The `{ $unit, $var, $const }` object scripts and rules are evaluated
 * against. Every question in `questions` is present (null, or `[]` for
 * arrays, when unanswered), so scripts don't throw on later questions.
 */
export function buildScope(
  questions: ReadonlyMap<string, AnyVariableType>,
  answers: Record<string, VariableValue | undefined>,
  unit?: Record<string, unknown> | null,
  constants?: Record<string, unknown> | null,
): ReferenceScope {
  const $var: Record<string, VarScopeEntry> = {};
  for (const [name, variable] of questions) $var[name] = varEntry(variable, answers[name]);
  return { $unit: { ...(unit ?? {}) }, $var, $const: { ...(constants ?? {}) } };
}

function varEntry(variable: AnyVariableType, value: VariableValue | undefined): VarScopeEntry {
  const answered = value !== undefined && !value.skip;
  const v = answered ? value : undefined;
  const type = variable.type;
  if (type === "confirm") return { answered };

  const codebookValue = (code: string | undefined) =>
    type !== "auto" && "codes" in variable ? variable.codes.find((c) => c.code === code)?.value : undefined;
  const valueOf = (c: { code?: string; value?: number }) => c.value ?? codebookValue(c.code) ?? null;

  if (type === "span") {
    const spans = v?.spans ?? [];
    return { answered, code: spans.map((s) => s.code), text: spans.map((s) => s.slices.map((t) => t.text).join(" ")) };
  }
  if (type === "relation") return { answered, code: (v?.relations ?? []).map((r) => r.code) };

  const codes = v?.codes ?? [];
  if (type === "scale" && variable.items?.length) {
    const entry: VarScopeEntry = { answered };
    for (const item of variable.items) {
      const answer = codes.find((c) => c.item === item.name);
      entry[item.name] = { code: answer?.code ?? null, value: answer ? valueOf(answer) : null };
    }
    return entry;
  }
  if ((type === "select_code" || type === "search_code") && variable.multiple) {
    const own = codes.filter((c) => c.item === undefined && c.code !== undefined);
    return {
      answered,
      code: own.map((c) => c.code!),
      value: own.map(valueOf).filter((n): n is number => n !== null),
    };
  }
  const first = codes.find((c) => c.item === undefined) ?? codes[0];
  return { answered, code: first?.code ?? null, value: first ? valueOf(first) : null };
}

/** The value at a reference in a scope (undefined if absent). */
export function referenceValue(scope: ReferenceScope, ref: Pick<Reference, "ns" | "path">): unknown {
  let value: unknown = scope[`$${ref.ns}`];
  for (const key of ref.path) {
    if (value === null || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

/** Parses a string that is exactly one reference (as in a condition rule's `ref`). */
export function parseReference(text: string): { ref: Reference } | { error: string } {
  const trimmed = text.trim();
  if (!trimmed.startsWith("$")) return { error: `'${text}' is not a reference ($unit.x, $var.q.code, $const.y)` };
  const read = readReference(trimmed, 0, false);
  if (!read) return { error: `'${text}' is not a reference ($unit.x, $var.q.code, $const.y)` };
  if (read.error) return { error: read.error.message };
  if (read.end !== trimmed.length) return { error: `'${text}' must be a single reference` };
  return { ref: read.ref! };
}

/** A template value as output text: strings as is, numbers via String, arrays joined, null empty, objects as JSON. */
export function outputText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(outputText).join(", ");
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
