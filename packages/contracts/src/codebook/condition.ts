import { z } from "zod";
import type { OptionValue } from "./options.js";
import { HELPER_METHODS, type HelperMethod, type ReferenceScope } from "./references.js";

// One condition notation, used by `condition` items and unit-loop branch
// `when` (docs/client.md "References and conditions"): a script. A *simple*
// condition uses only helper calls (`$var.topics.has("sports")`),
// `$var.q.answered`, `&&`, `||`, `!` and parentheses; it is parsed and
// evaluated here, without a JS engine, and validation checks its arguments.
// The editor's rules mode reads and writes it. Anything else is an advanced
// script, run in the client's QuickJS sandbox with the same helpers.

export const ConditionSchema = z
  .object({
    /** A JS expression over `$unit`, `$var` and `$const`; truthy = shown / matches. */
    script: z.string(),
  })
  .strict();
export type Condition = z.infer<typeof ConditionSchema>;

// ---- helpers -----------------------------------------------------------------

/** What helper methods work on: a question in the scope, or a scale item. */
export interface HelperTarget {
  value?: OptionValue | null;
  values?: OptionValue[];
}

/**
 * Applies a helper method. Every method is false (`count`: 0) while the
 * question is unanswered. Must match HELPER_PRELUDE.
 */
export function applyHelper(target: HelperTarget | undefined, method: HelperMethod, args: unknown[]): boolean | number {
  const value = target?.value ?? null;
  const values = target?.values ?? [];
  const n = typeof value === "number" ? value : null;
  const [a, b] = args;
  switch (method) {
    case "is":
    case "eq":
      return value !== null && value === a;
    case "isAny":
      return value !== null && args.includes(value);
    case "gt":
      return n !== null && typeof a === "number" && n > a;
    case "gte":
      return n !== null && typeof a === "number" && n >= a;
    case "lt":
      return n !== null && typeof a === "number" && n < a;
    case "lte":
      return n !== null && typeof a === "number" && n <= a;
    case "between":
      return n !== null && typeof a === "number" && typeof b === "number" && n >= a && n <= b;
    case "has":
      return values.includes(a as OptionValue);
    case "hasAny":
      return args.some((x) => values.includes(x as OptionValue));
    case "hasAll":
      return args.length > 0 && args.every((x) => values.includes(x as OptionValue));
    case "count":
      return values.length;
  }
}

/**
 * JS for the script sandbox: a function that adds the helper methods to a
 * `$var` scope (JSON data) and returns it. Must match `applyHelper`.
 */
export const HELPER_PRELUDE = `(($var) => {
  const one = (t) => {
    const n = () => (typeof t.value === "number" ? t.value : null);
    t.is = t.eq = (v) => t.value !== null && t.value === v;
    t.isAny = (...vs) => t.value !== null && vs.includes(t.value);
    t.gt = (x) => n() !== null && typeof x === "number" && n() > x;
    t.gte = (x) => n() !== null && typeof x === "number" && n() >= x;
    t.lt = (x) => n() !== null && typeof x === "number" && n() < x;
    t.lte = (x) => n() !== null && typeof x === "number" && n() <= x;
    t.between = (a, b) => n() !== null && typeof a === "number" && typeof b === "number" && n() >= a && n() <= b;
  };
  const many = (t) => {
    t.has = (v) => t.values.includes(v);
    t.hasAny = (...vs) => vs.some((v) => t.values.includes(v));
    t.hasAll = (...vs) => vs.length > 0 && vs.every((v) => t.values.includes(v));
    t.count = () => t.values.length;
  };
  for (const e of Object.values($var)) {
    if ("value" in e) one(e);
    else if (e.items) Object.values(e.items).forEach(one);
    else if (e.values) many(e);
  }
  return $var;
})`;

// ---- simple conditions -------------------------------------------------------

export const COUNT_COMPARISONS = [">", ">=", "<", "<=", "===", "!=="] as const;
export type CountComparison = (typeof COUNT_COMPARISONS)[number];

/** A helper call: `$var.q.method(args)` or `$var.q.items.x.method(args)`; `count()` with a comparison. */
export interface SimpleCall {
  op: "call";
  question: string;
  item?: string;
  method: HelperMethod;
  args: OptionValue[];
  compare?: { op: CountComparison; value: number };
}

export type SimpleCondition =
  | { op: "and" | "or"; args: SimpleCondition[] }
  | { op: "not"; arg: SimpleCondition }
  | { op: "const"; value: boolean }
  | { op: "answered"; question: string }
  | SimpleCall;

type Token = { t: "ref"; path: string[] } | { t: "str"; v: string } | { t: "num"; v: number } | { t: "sym"; v: string } | { t: "word"; v: string };

const SYMBOLS = ["&&", "||", "===", "!==", ">=", "<=", "!", "(", ")", ",", ">", "<"];

function tokenize(source: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const ref = /^\$var((?:\.[A-Za-z0-9_]+)+)/.exec(source.slice(i));
    if (ref) {
      tokens.push({ t: "ref", path: ref[1].slice(1).split(".") });
      i += ref[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let text = "";
      while (j < source.length && source[j] !== c) {
        if (source[j] === "\\") {
          const next = source[j + 1];
          if (next !== c && next !== "\\") return null;
          text += next;
          j += 2;
        } else {
          text += source[j++];
        }
      }
      if (j >= source.length) return null;
      tokens.push({ t: "str", v: text });
      i = j + 1;
      continue;
    }
    const num = /^-?\d+(\.\d+)?/.exec(source.slice(i));
    if (num) {
      tokens.push({ t: "num", v: Number(num[0]) });
      i += num[0].length;
      continue;
    }
    const word = /^[A-Za-z_]+/.exec(source.slice(i));
    if (word) {
      tokens.push({ t: "word", v: word[0] });
      i += word[0].length;
      continue;
    }
    const sym = SYMBOLS.find((s) => source.startsWith(s, i));
    if (!sym) return null;
    tokens.push({ t: "sym", v: sym });
    i += sym.length;
  }
  return tokens;
}

/** Parses a simple condition; null if the script is not one (it is then an advanced script). */
export function parseSimpleCondition(script: string): SimpleCondition | null {
  const tokens = tokenize(script);
  if (!tokens || tokens.length === 0) return null;
  let pos = 0;
  const peek = () => tokens[pos];
  const isSym = (v: string) => peek()?.t === "sym" && (peek() as { v: string }).v === v;

  const parseOr = (): SimpleCondition | null => {
    const args: SimpleCondition[] = [];
    do {
      const arg = parseAnd();
      if (!arg) return null;
      args.push(arg);
    } while (isSym("||") && ++pos);
    return args.length === 1 ? args[0] : { op: "or", args };
  };
  const parseAnd = (): SimpleCondition | null => {
    const args: SimpleCondition[] = [];
    do {
      const arg = parseUnary();
      if (!arg) return null;
      args.push(arg);
    } while (isSym("&&") && ++pos);
    return args.length === 1 ? args[0] : { op: "and", args };
  };
  const parseUnary = (): SimpleCondition | null => {
    const token = peek();
    if (!token) return null;
    if (isSym("!")) {
      pos++;
      const arg = parseUnary();
      return arg && { op: "not", arg };
    }
    if (isSym("(")) {
      pos++;
      const inner = parseOr();
      if (!inner || !isSym(")")) return null;
      pos++;
      return inner;
    }
    if (token.t === "word" && (token.v === "true" || token.v === "false")) {
      pos++;
      return { op: "const", value: token.v === "true" };
    }
    if (token.t !== "ref") return null;
    pos++;
    const path = token.path;
    if (path.length === 2 && path[1] === "answered") return { op: "answered", question: path[0] };
    let call: SimpleCall;
    const method = path[path.length - 1] as HelperMethod;
    if (!HELPER_METHODS.includes(method)) return null;
    if (path.length === 2) call = { op: "call", question: path[0], method, args: [] };
    else if (path.length === 4 && path[1] === "items") call = { op: "call", question: path[0], item: path[2], method, args: [] };
    else return null;
    if (!isSym("(")) return null;
    pos++;
    while (!isSym(")")) {
      const arg = peek();
      if (arg?.t !== "str" && arg?.t !== "num") return null;
      call.args.push(arg.v);
      pos++;
      if (isSym(",")) pos++;
      else if (!isSym(")")) return null;
    }
    pos++;
    if (method === "count") {
      const cmp = peek();
      if (cmp?.t !== "sym" || !(COUNT_COMPARISONS as readonly string[]).includes(cmp.v)) return null;
      pos++;
      const n = peek();
      if (n?.t !== "num") return null;
      pos++;
      call.compare = { op: cmp.v as CountComparison, value: n.v };
    }
    return call;
  };

  const result = parseOr();
  return result && pos === tokens.length ? result : null;
}

/** The script for a simple condition (the canonical form the rules editor writes). */
export function printSimpleCondition(condition: SimpleCondition, parent: "and" | "or" | "not" | null = null): string {
  switch (condition.op) {
    case "const":
      return String(condition.value);
    case "answered":
      return `$var.${condition.question}.answered`;
    case "call": {
      const target = condition.item ? `$var.${condition.question}.items.${condition.item}` : `$var.${condition.question}`;
      const call = `${target}.${condition.method}(${condition.args.map((a) => JSON.stringify(a)).join(", ")})`;
      if (!condition.compare) return call;
      const text = `${call} ${condition.compare.op} ${condition.compare.value}`;
      return parent ? `(${text})` : text;
    }
    case "not":
      return `!${printSimpleCondition(condition.arg, "not")}`;
    case "and":
    case "or": {
      const text = condition.args.map((a) => printSimpleCondition(a, condition.op)).join(condition.op === "and" ? " && " : " || ");
      return parent === "not" || (parent === "and" && condition.op === "or") ? `(${text})` : text;
    }
  }
}

function compare(a: number, op: CountComparison, b: number): boolean {
  switch (op) {
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case "===":
      return a === b;
    case "!==":
      return a !== b;
  }
}

/** Evaluates a simple condition against a scope (no JS engine needed). */
export function evaluateSimpleCondition(condition: SimpleCondition, scope: ReferenceScope): boolean {
  switch (condition.op) {
    case "const":
      return condition.value;
    case "answered":
      return scope.$var[condition.question]?.answered === true;
    case "not":
      return !evaluateSimpleCondition(condition.arg, scope);
    case "and":
      return condition.args.every((a) => evaluateSimpleCondition(a, scope));
    case "or":
      return condition.args.some((a) => evaluateSimpleCondition(a, scope));
    case "call": {
      const entry = scope.$var[condition.question];
      const target = condition.item ? entry?.items?.[condition.item] : entry;
      const result = applyHelper(target, condition.method, condition.args);
      if (condition.compare) return typeof result === "number" && compare(result, condition.compare.op, condition.compare.value);
      return result === true;
    }
  }
}

/** Every helper call in a simple condition. */
export function simpleConditionCalls(condition: SimpleCondition): SimpleCall[] {
  switch (condition.op) {
    case "call":
      return [condition];
    case "not":
      return simpleConditionCalls(condition.arg);
    case "and":
    case "or":
      return condition.args.flatMap(simpleConditionCalls);
    default:
      return [];
  }
}
