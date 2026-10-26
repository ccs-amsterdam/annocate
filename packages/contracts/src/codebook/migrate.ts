import { printSimpleCondition, type SimpleCondition } from "./condition.js";
import type { OptionValue } from "./options.js";
import { migrateLegacyUnitLoop } from "./unitLoop.js";

// Codebooks written before the question types of 2026-10 (select_code,
// search_code, `codes`, rules conditions) are migrated on parse, so stored
// codebooks keep working; the editor saves the new shape. Old `.code` /
// `.value` references inside scripts are not rewritten: validation flags them.

type Raw = Record<string, unknown>;
type OldCode = { code?: unknown; value?: unknown; color?: unknown };

const isObject = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);

function nominalOptions(codes: unknown) {
  if (!Array.isArray(codes)) return codes;
  return codes.map((c: OldCode) => ({ value: String(c.code ?? ""), ...(c.color !== undefined ? { color: c.color } : {}) }));
}

/** Ordinal options: the old values if they rise, else 1..n; the old code becomes the label. */
function ordinalOptions(codes: unknown) {
  if (!Array.isArray(codes)) return codes;
  const values = codes.map((c: OldCode) => c.value);
  const rising = values.every((v, i) => typeof v === "number" && (i === 0 || v > (values[i - 1] as number)));
  return codes.map((c: OldCode, i) => ({
    value: rising ? (c.value as number) : i + 1,
    label: String(c.code ?? ""),
    ...(c.color !== undefined ? { color: c.color } : {}),
  }));
}

/** Migrates one question's variable (a no-op for the current shape). */
export function migrateVariable(raw: unknown): unknown {
  if (!isObject(raw)) return raw;
  const { codes, vertical, ...rest } = raw;
  switch (raw.type) {
    case "select_code":
      return {
        ...rest,
        type: "categorical",
        options: nominalOptions(codes),
        ...(vertical ? { layout: "grid", columns: 1 } : {}),
      };
    case "search_code":
      return { ...rest, type: "categorical", options: nominalOptions(codes), layout: "dropdown" };
    case "scale": {
      if (!("codes" in raw)) return raw;
      const items = Array.isArray(raw.items) ? raw.items : [];
      if (items.length > 0) return { ...rest, options: ordinalOptions(codes) };
      delete rest.items;
      return { ...rest, type: "categorical", level: "ordinal", options: ordinalOptions(codes) };
    }
    case "annotinder":
    case "span":
    case "relation":
      return "codes" in raw ? { ...rest, options: nominalOptions(codes) } : raw;
    case "auto":
      if (!Array.isArray(raw.options)) return raw;
      return {
        ...raw,
        options: raw.options.map((o: Raw) => {
          if (!isObject(o) || !("code" in o)) return o;
          const { code, ...other } = o;
          return { ...other, value: String(code) };
        }),
      };
    default:
      return raw;
  }
}

interface OldRule {
  ref?: unknown;
  op?: unknown;
  value?: unknown;
}

type Questions = Map<string, Raw>;

/** A rule as a simple condition, or null if it has no simple equivalent. */
function ruleToSimple(rule: OldRule, questions: Questions): SimpleCondition | null {
  if (typeof rule.ref !== "string" || typeof rule.op !== "string") return null;
  const [ns, name, ...rest] = rule.ref.trim().split(".");
  if (ns !== "$var" || !name) return null;
  const variable = questions.get(name);
  if (!variable) return null;
  const expected = (Array.isArray(rule.value) ? rule.value : [rule.value]) as unknown[];
  const negate = rule.op === "isnot";
  const wrap = (c: SimpleCondition): SimpleCondition => (negate ? { op: "not", arg: c } : c);

  if (rest.length === 1 && rest[0] === "answered") {
    const yes = expected[0] === true || expected[0] === "true";
    if (rule.op !== "is" && rule.op !== "isnot") return null;
    return yes !== negate ? { op: "answered", question: name } : { op: "not", arg: { op: "answered", question: name } };
  }
  const item = rest.length === 2 ? rest[0] : undefined;
  const property = rest[rest.length - 1];
  if (property !== "code" && property !== "value") return null;

  const options = Array.isArray(variable.options) ? (variable.options as { value: OptionValue; label?: string }[]) : [];
  const ordinal = variable.type === "scale" || variable.level === "ordinal";
  // Old codes of ordinal questions are now labels; old values are now values.
  const toValue = (v: unknown): OptionValue | null => {
    if (ordinal && property === "code") return options.find((o) => o.label === String(v))?.value ?? null;
    if (ordinal) return typeof v === "number" ? v : Number.isFinite(Number(v)) ? Number(v) : null;
    return property === "code" ? String(v) : null;
  };
  const values = expected.map(toValue);
  if (values.some((v) => v === null)) return null;
  const args = values as OptionValue[];

  if (rule.op === "is" || rule.op === "isnot") {
    const many = variable.multiple === true || variable.type === "span" || variable.type === "relation";
    const method = many ? (args.length === 1 ? "has" : "hasAny") : args.length === 1 ? "is" : "isAny";
    return wrap({ op: "call", question: name, ...(item ? { item } : {}), method, args });
  }
  if (!ordinal || args.length !== 1 || !["gt", "gte", "lt", "lte"].includes(rule.op)) return null;
  return { op: "call", question: name, ...(item ? { item } : {}), method: rule.op as "gt", args };
}

/** The pre-2026-10 script for a rule (when it has no simple equivalent). */
function ruleToScript(rule: OldRule): string {
  const ref = String(rule.ref ?? "").trim();
  const values = Array.isArray(rule.value) ? rule.value : [rule.value];
  const literal = (v: unknown) => JSON.stringify(v);
  const symbol = { gt: ">", gte: ">=", lt: "<", lte: "<=" }[String(rule.op)];
  if (symbol) return `${ref} ${symbol} ${literal(rule.value)}`;
  const expr = values.length === 1 ? `${ref} === ${literal(values[0])}` : `${literal(values)}.includes(${ref})`;
  return rule.op === "isnot" ? `!(${expr})` : expr;
}

/** Migrates a rules condition (`{ match, rules }`) to a script; other values are returned as they are. */
export function migrateCondition(raw: unknown, questions: Questions): unknown {
  if (!isObject(raw) || !Array.isArray(raw.rules) || "script" in raw) return raw;
  const rules = raw.rules as OldRule[];
  if (rules.length === 0) return { script: "true" };
  const any = raw.match === "any";
  const simple = rules.map((r) => ruleToSimple(r, questions));
  if (simple.every((s) => s !== null)) {
    const all = simple as SimpleCondition[];
    return { script: printSimpleCondition(all.length === 1 ? all[0] : { op: any ? "or" : "and", args: all }) };
  }
  const parts = rules.map((r) => (rules.length > 1 ? `(${ruleToScript(r)})` : ruleToScript(r)));
  return { script: parts.join(any ? " || " : " && ") };
}

/**
 * Migrates a codebook's items (the whole tree): question variables, rules
 * conditions, and the legacy unit loop shape. Returns the input unchanged if
 * it isn't an array.
 */
export function migrateCodebookItems(items: unknown): unknown {
  if (!Array.isArray(items)) return items;
  const questions: Questions = new Map();
  const variables = (list: unknown): unknown => {
    if (!Array.isArray(list)) return list;
    return list.map((raw) => {
      if (!isObject(raw)) return raw;
      let item: Raw = raw.type === "unit_loop" ? (migrateLegacyUnitLoop(raw) as Raw) : raw;
      if ("variable" in item) {
        item = { ...item, variable: migrateVariable(item.variable) };
        if (typeof item.name === "string" && isObject(item.variable)) questions.set(item.name, item.variable);
      }
      if (Array.isArray(item.children)) item = { ...item, children: variables(item.children) };
      return item;
    });
  };
  const conditions = (list: unknown): unknown => {
    if (!Array.isArray(list)) return list;
    return list.map((raw) => {
      if (!isObject(raw)) return raw;
      let item = raw;
      if (item.type === "condition") item = { ...item, condition: migrateCondition(item.condition, questions) };
      if (item.type === "unit_loop" && Array.isArray(item.units)) {
        item = {
          ...item,
          units: item.units.map((b: unknown) => (isObject(b) && b.when ? { ...b, when: migrateCondition(b.when, questions) } : b)),
        };
      }
      if (Array.isArray(item.children)) item = { ...item, children: conditions(item.children) };
      return item;
    });
  };
  return conditions(variables(items));
}
