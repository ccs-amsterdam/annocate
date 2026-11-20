import { z } from "zod";
import { SafeNameSchema } from "../common.js";
import { ConditionSchema, type Condition } from "./condition.js";
import { UnitLayoutSchema } from "./layout.js";
import { outputText, parseTemplate, referenceValue, type ReferenceScope } from "./references.js";
import { UnitLoopDistributionShape } from "./unitLoop.js";
import { SessionItemSchema, type SessionItem } from "./session.js";
import { ComputedVariableSchema, UserVariableTypeSchema, UnitVariableTypeSchema } from "./variableTypes.js";

const ItemBaseSchema = z.object({
  name: SafeNameSchema,
});

/**
 * Conditions have no name (nothing refers to them): the editor shows their
 * condition, or this label if the researcher gives one.
 */
const ConditionLabelSchema = z.string().optional().describe("Shown in the editor instead of the condition");

/**
 * A question item appearing at the top level of a design.
 * Results in a stored coder-level (non-unit) variable value.
 */
export const TopLevelQuestionItemSchema = ItemBaseSchema.extend({
  type: z.literal("question"),
  variable: UserVariableTypeSchema,
});
export type TopLevelQuestionItem = z.infer<typeof TopLevelQuestionItemSchema>;

/**
 * A question item appearing inside a unit_loop.
 * Results in a stored per-unit, per-coder variable value.
 */
export const InLoopQuestionItemSchema = ItemBaseSchema.extend({
  type: z.literal("question"),
  variable: UnitVariableTypeSchema,
});
export type InLoopQuestionItem = z.infer<typeof InLoopQuestionItemSchema>;

/**
 * Ends the coder's session when the coder reaches it, usually inside a
 * condition: `screenout` (not eligible) or `complete`. Optionally shows a
 * message and sends the coder on, e.g. back to a panel company.
 */
export const EndItemSchema = ItemBaseSchema.extend({
  type: z.literal("end"),
  outcome: z.enum(["screenout", "complete"]),
  message: z.string().optional().describe("Shown at the end: a markdown template like a question text."),
  redirectUrl: z
    .string()
    .optional()
    .describe(
      "Where to send the coder, e.g. a panel's return link. May contain $var references (filled in URL-encoded).",
    ),
  redirectSetting: SafeNameSchema.optional().describe(
    "Instead of redirectUrl: the name of a deployment setting holding the URL (the study's settings), for a link that differs per run, such as a panel's.",
  ),
});
export type EndItem = z.infer<typeof EndItemSchema>;

/**
 * A computed variable: a value the study works out itself, not asked. Its
 * `name` is the variable's name (`$var.<name>`); stored like an answer.
 * `variable.type`: `random` (a random condition, drawn by the server when
 * the coder reaches it; optionally linked to a set column of the units).
 * Coder level only (not inside a unit loop).
 */
export const ComputedItemSchema = ItemBaseSchema.extend({
  type: z.literal("computed"),
  variable: ComputedVariableSchema,
});
export type ComputedItem = z.infer<typeof ComputedItemSchema>;

/** The deployment settings end items send coders to (`redirectSetting`), by name. */
export function redirectSettings(items: readonly unknown[]): string[] {
  const names = new Set<string>();
  const walk = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const raw of list) {
      const item = raw as { type?: unknown; redirectSetting?: unknown; children?: unknown } | null;
      if (!item || typeof item !== "object") continue;
      if (item.type === "end" && typeof item.redirectSetting === "string") names.add(item.redirectSetting);
      // The study's normal end (the Study entry's `end`)
      const end = item.type === "session" ? (item as { end?: { redirectSetting?: unknown } }).end : undefined;
      if (typeof end?.redirectSetting === "string") names.add(end.redirectSetting);
      walk(item.children);
    }
  };
  walk(items);
  return [...names];
}

/**
 * Items with each end item's `redirectSetting` replaced by its URL from the
 * deployment settings (none set: no redirect). What coders get.
 */
export function resolveRedirects<T>(items: readonly T[], urls: Record<string, string>): T[] {
  return items.map((raw) => {
    const item = raw as { type?: unknown; redirectSetting?: unknown; children?: unknown };
    if (!item || typeof item !== "object") return raw;
    let next = item;
    if (Array.isArray(item.children)) next = { ...next, children: resolveRedirects(item.children, urls) };
    if (item.type === "end" && typeof item.redirectSetting === "string") {
      const resolved: Record<string, unknown> = { ...next };
      delete resolved.redirectSetting;
      const url = urls[item.redirectSetting];
      if (url) resolved.redirectUrl = url;
      next = resolved;
    }
    return next as T;
  });
}

/** An end item's redirect URL with its `$var` references filled in, URL-encoded. */
export function fillRedirectUrl(url: string, scope: ReferenceScope): string {
  return parseTemplate(url)
    .segments.map((s) => {
      if (s.type === "text") return s.text.replace(/\\\$/g, "$");
      return s.ref ? encodeURIComponent(outputText(referenceValue(scope, s.ref))) : "";
    })
    .join("");
}

/**
 * General Question item schema anywhere in the tree.
 */
export const QuestionItemSchema = ItemBaseSchema.extend({
  type: z.literal("question"),
  variable: UnitVariableTypeSchema,
});
export type QuestionItem = z.infer<typeof QuestionItemSchema>;

/**
 * Items that can appear inside a unit_loop:
 * - Question items (can include span, relation, categorical, etc.)
 * - End items
 * - Condition items (whose children can only be in-loop items)
 */
export type InLoopItem =
  | InLoopQuestionItem
  | EndItem
  | {
      type: "show_if";
      label?: string;
      condition: Condition;
      children: InLoopItem[];
    };

export const InLoopConditionItemSchema: z.ZodType<Extract<InLoopItem, { type: "show_if" }>> = z.lazy(() =>
  z.object({
    type: z.literal("show_if"),
    label: ConditionLabelSchema,
    condition: ConditionSchema.describe("A script over earlier answers ($var), and in a loop $unit"),
    children: z.array(InLoopItemSchema).min(1, "Condition must have at least one child item"),
  }),
);

export const InLoopItemSchema: z.ZodType<InLoopItem> = z.lazy(() =>
  z.union([InLoopQuestionItemSchema, EndItemSchema, InLoopConditionItemSchema]),
);

/**
 * A `for unit in ...` loop. Which units a coder gets is described by `units`
 * (branches, see unitLoop.ts) and `order`. Children can ONLY be in-loop items (question or in-loop
 * condition). Nested unit loops are strictly disallowed.
 */
export const UnitLoopItemSchema = z.object({
  type: z.literal("unit_loop"),
  /** Shown in the editor and in exports; the loop has no name (it is identified by its position, see `unitLoops`). */
  label: z.string().optional().describe("Shown in the editor and in exports"),
  ...UnitLoopDistributionShape,
  layout: UnitLayoutSchema,
  children: z.array(InLoopItemSchema).min(1, "A unit_loop must have at least one child item"),
});
export type UnitLoopItem = z.infer<typeof UnitLoopItemSchema>;

/**
 * Items that can appear at the top level:
 * - Question items (coder-level)
 * - Unit loops
 * - Top-level condition items (whose children can be any top-level items)
 * - The Session item (at most one, first: `session.ts`)
 */
export type TopLevelItem =
  | TopLevelQuestionItem
  | ComputedItem
  | UnitLoopItem
  | EndItem
  | SessionItem
  | {
      type: "show_if";
      label?: string;
      condition: Condition;
      children: TopLevelItem[];
    };

export const TopLevelConditionItemSchema: z.ZodType<Extract<TopLevelItem, { type: "show_if" }>> = z.lazy(() =>
  z.object({
    type: z.literal("show_if"),
    label: ConditionLabelSchema,
    condition: ConditionSchema.describe("A script over earlier answers ($var), and in a loop $unit"),
    children: z.array(TopLevelItemSchema).min(1, "Condition must have at least one child item"),
  }),
);

export const TopLevelItemSchema: z.ZodType<TopLevelItem> = z.lazy(() =>
  z.union([
    TopLevelQuestionItemSchema,
    ComputedItemSchema,
    UnitLoopItemSchema,
    EndItemSchema,
    SessionItemSchema,
    TopLevelConditionItemSchema,
  ]),
);

/**
 * Any condition item (top level or inside loop).
 */
export type ConditionItem = Extract<TopLevelItem | InLoopItem, { type: "show_if" }>;

/**
 * Any design item anywhere in the tree.
 */
export type DesignItem = TopLevelItem | InLoopItem;

/** An item's name; conditions have none. */
export function itemName(item: DesignItem): string | undefined {
  return item.type === "show_if" || item.type === "unit_loop" || item.type === "session" ? undefined : item.name;
}

/**
 * The unit loops of a design in document order, with their key: their
 * position (`"1"`, `"2"`, ...). The key identifies a loop within one
 * design version (the coder API's `/loop/:loop`, progress, distribution
 * state).
 */
export function unitLoops(items: readonly unknown[]): { key: string; loop: UnitLoopItem }[] {
  const loops: { key: string; loop: UnitLoopItem }[] = [];
  const walk = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const raw of list) {
      const item = raw as Partial<DesignItem> | null;
      if (!item || typeof item !== "object") continue;
      if (item.type === "unit_loop") loops.push({ key: String(loops.length + 1), loop: item as UnitLoopItem });
      else if (item.type === "show_if") walk(item.children);
    }
  };
  walk(items);
  return loops;
}

/** How a loop is called in the editor, progress and exports: its label, or "Unit loop <key>". */
export function loopTitle(loop: { label?: string }, key: string): string {
  return loop.label?.trim() || `Unit loop ${key}`;
}
