import type { VariableValue } from "../variableValue.js";
import { optionLabel, type OptionValue } from "./options.js";
import type { AnyVariableType } from "./variableTypes.js";

// One reference syntax for scripts, templates, question texts and conditions
// (docs/client.md "References and conditions"). The name says the shape:
//
//   $unit.<field>                       a unit data column (inside a unit loop)
//   $const.<name>                       a layout constant (inside a unit loop)
//   $var.<q>.value / .label             one answer (null when unanswered)
//   $var.<q>.values / .labels           several answers ([] when unanswered)
//   $var.<q>.texts                      the selected texts (span questions)
//   $var.<q>.items.<item>.value/.label  one item of a scale
//   $var.<q>.answered                   true if answered and not skipped
//   $var.<q>.is("x"), .gte(3), ...      helper methods (HELPER_METHODS)
//
// Names are always literal, so what a codebook refers to (and where) can be
// checked without running anything. All functions here are pure, shared by
// the client runtime, codebook validation and the admin editor.

export type ReferenceNamespace = "unit" | "var" | "const";

/** How a template value is output (`$ref::markdown`); `text` is the default. */
export const OUTPUT_SUFFIXES = ["text", "markdown", "image", "tokenize"] as const;
export type OutputSuffix = (typeof OUTPUT_SUFFIXES)[number];

/** `$var.<q>` properties. */
export const VAR_PROPERTIES = ["value", "label", "values", "labels", "texts", "answered", "items"] as const;
export type VarProperty = (typeof VAR_PROPERTIES)[number];
/** Properties of a scale item, `$var.<q>.items.<item>`. */
export const ITEM_PROPERTIES = ["value", "label"] as const;

/** Helper methods on a question (or a scale item), e.g. `$var.topics.has("sports")`. */
export const HELPER_METHODS = ["is", "isAny", "gt", "gte", "lt", "lte", "eq", "between", "has", "hasAny", "hasAll", "count"] as const;
export type HelperMethod = (typeof HELPER_METHODS)[number];

export interface Reference {
  ns: ReferenceNamespace;
  /** `["headline"]` for `$unit.headline`, `["interest", "items", "tech", "value"]` for `$var.interest.items.tech.value`. */
  path: string[];
  /** Set when the last path segment is a helper method that is called: `$var.q.is(...)`. */
  call?: boolean;
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

/** The source text of a reference, e.g. `$var.role.value`. */
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
  // In a script, `a$var` and `x.$var` are ordinary identifiers; in a template, `part_$var.slot.value` is a reference.
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
  let call = false;
  if (ns === "var") {
    // A property, or a called method: of the question or of a scale item.
    const member = (allowed: readonly string[], label: string): string | { error: string } => {
      const name = segment();
      if (name === null) return { error: `${label} needs a property: ${allowed.map((p) => `.${p}`).join(", ")}, or a method like .is(...)` };
      if ((HELPER_METHODS as readonly string[]).includes(name)) {
        if (source[pos] !== "(") return { error: `${label}.${name} is a method: call it, ${label}.${name}(...)` };
        if (template) return { error: `${label}.${name}(...) can only be used inside {{ }}` };
        call = true;
        return name;
      }
      if (!allowed.includes(name)) {
        const hint = name === "code" ? " (.code is now .value, or .values for several answers)" : name === "text" ? " (.text is now .texts)" : "";
        return { error: `${label}.${name}: unknown property${hint}; use ${allowed.map((p) => `.${p}`).join(", ")} or a method` };
      }
      return name;
    };
    const second = member(VAR_PROPERTIES, `$var.${first}`);
    if (typeof second !== "string") return fail(second.error);
    path.push(second);
    if (second === "items") {
      const item = segment();
      if (item === null) return fail(`$var.${first}.items needs an item name: $var.${first}.items.<item>.value`);
      path.push(item);
      const property = member(ITEM_PROPERTIES, `$var.${first}.items.${item}`);
      if (typeof property !== "string") return fail(property.error);
      path.push(property);
    }
  }
  if (!call && source[pos] === "[") return fail(`Names in ${referenceText({ ns, path })}[...] must be literal, not computed`);

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
  return { ref: { ns, path, ...(call ? { call } : {}), suffix, start: at, end: pos }, end: pos };
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

/** The kinds of block fence lines: `::: if <script>`, `::: else if <script>`, `::: else`, `::: from <question>`, `::: style <css>`, `:::` (closes). */
export type FenceKeyword = "if" | "else if" | "else" | "from" | "style" | "close";

/** A block fence line in a template (docs/client.md §3, "Blocks"). */
export interface TemplateFence {
  keyword: FenceKeyword | null;
  /** The number of colons: a block is closed by a fence with as many. */
  colons: number;
  /** What follows the keyword (a script, a question, CSS), trimmed. */
  arg: string;
  /** Where `arg` starts in the source. */
  argStart: number;
  /** The line, from its start to after its newline. */
  start: number;
  end: number;
}

const FENCE_LINE = /^ {0,3}(:{3,})[ \t]*(.*?)[ \t]*$/gm;
const FENCE_KEYWORD = /^(else\s+if|if|else|from|style)\b\s*/;

/** The block fence lines of a template: lines starting with `:::` (outside code). */
export function templateFences(source: string): TemplateFence[] {
  if (!source.includes(":::")) return [];
  const code = codeRanges(source);
  const fences: TemplateFence[] = [];
  for (const m of source.matchAll(FENCE_LINE)) {
    const start = m.index;
    if (code.some(([s, e]) => start >= s && start < e)) continue;
    let end = start + m[0].length;
    if (source[end] === "\n") end++;
    const rest = m[2];
    const afterColons = m[0].indexOf(m[1]) + m[1].length;
    const tail = m[0].slice(afterColons);
    const restStart = start + afterColons + (tail.length - tail.trimStart().length);
    const kw = FENCE_KEYWORD.exec(rest);
    const keyword: FenceKeyword | null =
      rest === "" ? "close" : kw ? (/^else\s+if$/.test(kw[1]) ? "else if" : (kw[1] as FenceKeyword)) : null;
    const argOffset = kw ? kw[0].length : 0;
    fences.push({ keyword, colons: m[1].length, arg: rest.slice(argOffset).trim(), argStart: restStart + argOffset, start, end });
  }
  return fences;
}

/**
 * Splits a template (the unit layout, a question or instruction text, a
 * unitset name) into literal text and expressions. Syntax: `$unit.x`,
 * `$var.q.value`, `$const.y` or `{{ js }}`, each with an optional
 * `::text|markdown|image|tokenize` suffix. `\$` is a literal `$`; references
 * inside markdown code spans and fences stay literal. Block fence lines
 * (`::: if ...`) are left out: `parseTemplateBlocks` reads them.
 */
export function parseTemplate(source: string): ParsedTemplate {
  const segments: TemplateSegment[] = [];
  const errors: ReferenceError[] = [];
  let text = "";
  let i = 0;
  const literal = new Set<number>();
  for (const [s, e] of codeRanges(source)) for (let k = s; k < e; k++) literal.add(k);
  // Block fence lines aren't text (their scripts are parsed with the blocks: templateBlocks.ts).
  const fenceAt = new Map(templateFences(source).map((f) => [f.start, f.end]));

  const push = (expr: Omit<TemplateExpression, "type" | "alone">) => {
    if (text) segments.push({ type: "text", text });
    text = "";
    segments.push({ type: "expression", ...expr, alone: aloneOnLine(source, expr.start, expr.end) });
  };

  while (i < source.length) {
    const c = source[i];
    if (fenceAt.has(i)) {
      i = fenceAt.get(i)!;
    } else if (literal.has(i)) {
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
export function codeRanges(source: string): [number, number][] {
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

/**
 * What a question holds, which decides its references and helper methods:
 * one answer (`single`, `ordinal`, `numeric`), several (`multiple`, `span`,
 * `relation`), one per item (`scale`), or none (`confirm`).
 */
export type QuestionKind = "single" | "ordinal" | "numeric" | "multiple" | "span" | "relation" | "scale" | "confirm";

export function questionKind(variable: AnyVariableType): QuestionKind {
  switch (variable.type) {
    case "nominal":
      return variable.multiple ? "multiple" : "single";
    case "ordinal":
      return "ordinal";
    case "annotinder":
    case "auto":
      return "single";
    default:
      return variable.type;
  }
}

/** The properties of `$var.<q>` per kind (besides `answered`). */
const KIND_PROPERTIES: Record<QuestionKind, readonly string[]> = {
  single: ["value", "label"],
  ordinal: ["value", "label"],
  numeric: ["value", "label"],
  multiple: ["values", "labels"],
  span: ["values", "labels", "texts"],
  relation: ["values", "labels"],
  scale: ["values", "items"],
  confirm: [],
};

/** The helper methods per kind; scale items take the `ordinal` ones. */
export const KIND_METHODS: Record<QuestionKind, readonly HelperMethod[]> = {
  single: ["is", "isAny"],
  ordinal: ["is", "isAny", "gt", "gte", "lt", "lte"],
  numeric: ["eq", "gt", "gte", "lt", "lte", "between"],
  multiple: ["has", "hasAny", "hasAll", "count"],
  span: ["has", "count"],
  relation: ["has", "count"],
  scale: [],
  confirm: [],
};

/** The option values of a question (for checking arguments and rule values); undefined for numeric and confirm. */
export function questionValues(variable: AnyVariableType): OptionValue[] | undefined {
  if ("options" in variable && variable.options) return variable.options.map((o) => o.value);
  return undefined;
}

export type ReferenceValueType = "string" | "number" | "boolean" | "any";

/** What a reference holds, as follows from the codebook (never from the runtime value). */
export type ReferenceShape =
  | {
      ok: true;
      /** Arrays (`values`, `labels`, `texts`) are `[]` when unanswered; scalars are `null`. */
      array: boolean;
      type: ReferenceValueType;
      /** The possible values, if known. */
      values?: OptionValue[];
      /** For a called helper method: its name, and the kind of the question (or scale item) it is called on. */
      method?: { name: HelperMethod; kind: QuestionKind };
      warning?: string;
    }
  | { ok: false; reason: string };

/**
 * The shape of a reference. `$var` refs are looked up in `questions`;
 * `$unit` fields are untyped here (`any`); constants are strings.
 */
export function referenceShape(
  questions: ReadonlyMap<string, AnyVariableType>,
  ref: Pick<Reference, "ns" | "path" | "call">,
): ReferenceShape {
  if (ref.ns === "unit") return { ok: true, array: false, type: "any" };
  if (ref.ns === "const") return { ok: true, array: false, type: "string" };
  const [name, ...rest] = ref.path;
  const variable = questions.get(name);
  if (!variable) return { ok: false, reason: `'${name}' is not a question` };
  return varShape(name, variable, rest, ref.call === true);
}

function valueType(kind: QuestionKind): ReferenceValueType {
  return kind === "ordinal" || kind === "numeric" || kind === "scale" ? "number" : "string";
}

/** What a helper method does, in words (for messages and the condition editor). */
export const METHOD_TEXT: Record<HelperMethod, string> = {
  is: "is",
  isAny: "is one of",
  gt: "greater than",
  gte: "greater than or equal to",
  lt: "lower than",
  lte: "lower than or equal to",
  eq: "equals",
  between: "between",
  has: "has",
  hasAny: "has any of",
  hasAll: "has all of",
  count: "count",
};

/** A question's type in words, for messages: "a nominal question". */
export function describeQuestion(variable: AnyVariableType): string {
  switch (variable.type) {
    case "nominal":
      return variable.multiple ? "a nominal question with multiple answers" : "a nominal question";
    case "annotinder":
      return "a swipe question";
    case "auto":
      return "an automatic assignment";
    case "scale":
      return "a scale";
    case "ordinal":
    case "numeric":
    case "confirm":
    case "span":
    case "relation":
      return `${variable.type === "ordinal" ? "an" : "a"} ${variable.type} question`;
    default:
      return "a question";
  }
}

/** `"a", "b" or "c"`. */
export function orList(words: string[]): string {
  return words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

const ORDER_METHODS: readonly string[] = ["gt", "gte", "lt", "lte", "between"];

/** Why a question (or scale item, `subject`) can't take a helper method, in words. */
function methodShape(subject: string, description: string, method: string, kind: QuestionKind, values?: OptionValue[]): ReferenceShape {
  if (!(KIND_METHODS[kind] as readonly string[]).includes(method)) {
    const available = KIND_METHODS[kind].map((m) => `"${METHOD_TEXT[m]}"`);
    const what = (METHOD_TEXT as Record<string, string>)[method];
    const unsupported = what ? `"${what}"${ORDER_METHODS.includes(method) ? " comparisons" : ""}` : `.${method}()`;
    const use =
      kind === "scale" ? "; compare its items instead" : available.length ? `; use ${orList(available)}` : `; only "is answered" works`;
    return { ok: false, reason: `${subject} is ${description}, which does not support ${unsupported}${use}` };
  }
  return { ok: true, array: false, type: method === "count" ? "number" : "boolean", values, method: { name: method as HelperMethod, kind } };
}

function varShape(name: string, variable: AnyVariableType, rest: string[], call: boolean): ReferenceShape {
  const label = `$var.${[name, ...rest].join(".")}`;
  const kind = questionKind(variable);
  const values = questionValues(variable);
  const [property] = rest;

  if (property === "items") {
    if (variable.type !== "scale") return { ok: false, reason: `${label}: '${name}' has no items (only scales do)` };
    const [, item, itemProperty] = rest;
    if (!variable.items.some((i) => i.name === item)) return { ok: false, reason: `${label}: '${item}' is not an item of '${name}'` };
    if (call) return methodShape(`"${name} › ${item}"`, "a scale item", itemProperty, "ordinal", values);
    return { ok: true, array: false, type: itemProperty === "label" ? "string" : "number", values: itemProperty === "value" ? values : undefined };
  }
  if (call) return methodShape(`"${name}"`, describeQuestion(variable), property, kind, values);
  if (property === "answered") return { ok: true, array: false, type: "boolean" };
  if (!KIND_PROPERTIES[kind].includes(property)) {
    const available = [...KIND_PROPERTIES[kind].map((p) => (p === "items" ? ".items.<item>" : `.${p}`)), ".answered"];
    return { ok: false, reason: `${label}: "${name}" is ${describeQuestion(variable)}, which has no .${property}; use ${orList(available)}` };
  }
  const array = property === "values" || property === "labels" || property === "texts";
  if (property === "value" || property === "values") return { ok: true, array, type: valueType(kind), values };
  return { ok: true, array, type: "string" };
}

export interface ReferenceOption {
  /** E.g. `$var.role.value`. */
  ref: string;
  shape: Extract<ReferenceShape, { ok: true }>;
}

/**
 * The `$var` references to these questions that fit their types, e.g. for a
 * reference picker. Pass the questions available at a point (validation
 * `availableQuestions`).
 */
export function referenceOptions(questions: Iterable<{ name: string; variable: AnyVariableType }>): ReferenceOption[] {
  const options: ReferenceOption[] = [];
  for (const { name, variable } of questions) {
    const lookup = new Map([[name, variable]]);
    const kind = questionKind(variable);
    const paths = [
      ...KIND_PROPERTIES[kind].filter((p) => p !== "items").map((p) => [p]),
      ...(variable.type === "scale" ? variable.items.flatMap((item) => ITEM_PROPERTIES.map((p) => ["items", item.name, p])) : []),
      ["answered"],
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

/** A scale item in the scope. */
export interface ItemScopeEntry {
  value: number | null;
  label: string | null;
}

/** A question in the scope: the properties its kind has (see KIND_PROPERTIES). */
export interface VarScopeEntry {
  answered: boolean;
  value?: OptionValue | null;
  label?: string | null;
  values?: OptionValue[];
  labels?: string[];
  texts?: string[];
  items?: Record<string, ItemScopeEntry>;
}

export interface ReferenceScope {
  $unit: Record<string, unknown>;
  $var: Record<string, VarScopeEntry>;
  $const: Record<string, unknown>;
}

/**
 * The `{ $unit, $var, $const }` object scripts and conditions are evaluated
 * against. Every question in `questions` is present (null, or `[]` for
 * lists, when unanswered), so scripts don't throw on later questions. Helper
 * methods are not in here (the scope is plain data): simple conditions apply
 * them with `applyHelper`, the script sandbox adds them (HELPER_PRELUDE).
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

/** The label of a value: the option's label, a numeric break-point label, or the value as text. */
export function valueLabel(variable: AnyVariableType, value: OptionValue): string {
  if ("options" in variable && variable.options) {
    const option = variable.options.find((o) => o.value === value);
    if (option) return optionLabel(option);
  }
  if (variable.type === "numeric") {
    const label = variable.labels?.find((l) => l.value === value);
    if (label) return label.label;
  }
  return String(value);
}

function varEntry(variable: AnyVariableType, answer: VariableValue | undefined): VarScopeEntry {
  const answered = answer !== undefined && !answer.skip;
  const v = answered ? answer : undefined;
  const kind = questionKind(variable);
  const labelOf = (value: OptionValue) => valueLabel(variable, value);

  switch (kind) {
    case "confirm":
      return { answered };
    case "span": {
      const spans = v?.spans ?? [];
      return {
        answered,
        values: spans.map((s) => s.value),
        labels: spans.map((s) => labelOf(s.value)),
        texts: spans.map((s) => s.slices.map((t) => t.text).join(" ")),
      };
    }
    case "relation": {
      const relations = v?.relations ?? [];
      return { answered, values: relations.map((r) => r.value), labels: relations.map((r) => labelOf(r.value)) };
    }
    case "scale": {
      const items: Record<string, ItemScopeEntry> = {};
      const values: OptionValue[] = [];
      for (const item of variable.type === "scale" ? variable.items : []) {
        const value = v?.values?.find((a) => a.item === item.name)?.value;
        items[item.name] = typeof value === "number" ? { value, label: labelOf(value) } : { value: null, label: null };
        if (typeof value === "number") values.push(value);
      }
      return { answered, values, items };
    }
    case "multiple": {
      const values = (v?.values ?? []).filter((a) => a.item === undefined).map((a) => a.value);
      return { answered, values, labels: values.map(labelOf) };
    }
    default: {
      const value = v?.values?.find((a) => a.item === undefined)?.value ?? null;
      return { answered, value, label: value === null ? null : labelOf(value) };
    }
  }
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
  if (!trimmed.startsWith("$")) return { error: `'${text}' is not a reference ($unit.x, $var.q.value, $const.y)` };
  const read = readReference(trimmed, 0, false);
  if (!read) return { error: `'${text}' is not a reference ($unit.x, $var.q.value, $const.y)` };
  if (read.error) return { error: read.error.message };
  if (read.end !== trimmed.length || read.ref?.call) return { error: `'${text}' must be a single reference` };
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
