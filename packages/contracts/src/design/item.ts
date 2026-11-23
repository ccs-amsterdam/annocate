import { z } from "zod";
import { SafeNameSchema } from "../common.js";
import { ConditionSchema, type Condition } from "./condition.js";
import { UnitLayoutSchema } from "./layout.js";
import { outputText, parseTemplate, referenceValue, type ReferenceScope } from "./references.js";
import { UnitLoopDistributionShape } from "./unitLoop.js";
import { SessionItemSchema, type SessionItem } from "./session.js";
import { RandomVariableSchema, UserVariableTypeSchema, UnitVariableTypeSchema } from "./variableTypes.js";
import { forEachItem, itemLists } from "./walk.js";

const ItemBaseSchema = z.object({
  name: SafeNameSchema,
});

/**
 * Branches have no name (nothing refers to them): an optional label, for
 * the researcher (e.g. "Screen-out"), shown in the editor.
 */
const BranchLabelSchema = z.string().optional().describe("Shown in the editor, e.g. Screen-out");

/** A branch's condition (required): its items are shown only if it holds (else its else items). */
const BranchConditionSchema = z
  .object(ConditionSchema.shape, {
    error: (iss) => (iss.input === undefined ? "A branch needs a condition: when its items are shown" : undefined),
  })
  .strict()
  .describe("Shown only if this holds: a script over earlier answers ($var), and in a loop $unit");

/**
 * A question item appearing at the top level of a design.
 * Results in a stored coder-level (non-unit) variable value.
 */
export const TopLevelQuestionItemSchema = ItemBaseSchema.extend({
  type: z.literal("question"),
  variable: UserVariableTypeSchema,
  /** Instructions are for questions coders answer for unit after unit (in a unit loop); details go in the question. */
  instruction: z
    .never({ error: "Instructions are for questions in unit loops: put details in the question text" })
    .optional(),
  instructionOpen: z.never({ error: "Instructions are for questions in unit loops" }).optional(),
});
export type TopLevelQuestionItem = z.infer<typeof TopLevelQuestionItemSchema>;

/**
 * A question item appearing inside a unit_loop.
 * Results in a stored per-unit, per-coder variable value.
 */
export const InLoopQuestionItemSchema = ItemBaseSchema.extend({
  type: z.literal("question"),
  variable: UnitVariableTypeSchema,
  /**
   * How to apply the question to units (docs/client.md §4 "Instructions"):
   * a markdown template like the question, which coders open from the
   * question (a ? button, or the ? key) to look up while coding.
   */
  instruction: z
    .string()
    .optional()
    .describe(
      "How to apply the question to units: a markdown template coders open from the question (? button or key).",
    ),
  /** The instruction also opens by itself: the first time the question comes up, or on practice units. */
  instructionOpen: z.enum(["first", "practice"]).optional(),
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
 * An experiment: each coder gets one of its conditions, assigned by the
 * server when the coder reaches it (at random, balanced, or a URL
 * parameter's value), never asked; with `units`, each condition gets its
 * own units (the units' `condition_set`).
 * Its `name` is the variable's name (`$var.<name>`); stored like an answer.
 * Coder level only (not inside a unit loop).
 */
export const ExperimentItemSchema = ItemBaseSchema.extend({
  type: z.literal("experiment"),
  variable: RandomVariableSchema,
});
export type ExperimentItem = z.infer<typeof ExperimentItemSchema>;

/** The deployment settings end items send coders to (`redirectSetting`), by name. */
export function redirectSettings(items: readonly unknown[]): string[] {
  const names = new Set<string>();
  forEachItem<{ type?: unknown; redirectSetting?: unknown; end?: { redirectSetting?: unknown } }>(items, (item) => {
    if (item.type === "end" && typeof item.redirectSetting === "string") names.add(item.redirectSetting);
    // The study's normal end (the Study entry's `end`)
    const end = item.type === "session" ? item.end : undefined;
    if (typeof end?.redirectSetting === "string") names.add(end.redirectSetting);
  });
  return [...names];
}

/**
 * Items with each end item's `redirectSetting` replaced by its URL from the
 * deployment settings (none set: no redirect). What coders get.
 */
export function resolveRedirects<T>(items: readonly T[], urls: Record<string, string>): T[] {
  return items.map((raw) => {
    const item = raw as { type?: unknown; redirectSetting?: unknown; children?: unknown; elseChildren?: unknown };
    if (!item || typeof item !== "object") return raw;
    let next = item;
    if (Array.isArray(item.children)) next = { ...next, children: resolveRedirects(item.children, urls) };
    if (Array.isArray(item.elseChildren)) next = { ...next, elseChildren: resolveRedirects(item.elseChildren, urls) };
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
 * How a unit is shown (docs/client.md §3), from where the coder passes it
 * on: the questions after it show the unit with this layout, until the
 * next layout item. Before any (or with none), questions show no unit.
 * In a branch, it applies only when the branch's items are shown.
 * Layout items have no name; the label is for the editor.
 */
export const LayoutItemSchema = UnitLayoutSchema.extend({
  type: z.literal("layout"),
  label: z.string().optional().describe("Shown in the editor, e.g. With the full text"),
});
export type LayoutItem = z.infer<typeof LayoutItemSchema>;

/**
 * Items that can appear inside a unit_loop:
 * - Question items (can include span, relation, categorical, etc.)
 * - Layout items (how the unit is shown from there on)
 * - End items
 * - Branches (whose children can only be in-loop items)
 */
export type InLoopItem =
  | InLoopQuestionItem
  | LayoutItem
  | EndItem
  | {
      type: "branch";
      label?: string;
      condition: Condition;
      children: InLoopItem[];
      elseChildren?: InLoopItem[];
    };

export const InLoopBranchItemSchema: z.ZodType<Extract<InLoopItem, { type: "branch" }>> = z.lazy(() =>
  z.object({
    type: z.literal("branch"),
    label: BranchLabelSchema,
    condition: BranchConditionSchema,
    children: z.array(InLoopItemSchema).min(1, "A branch must have at least one item"),
    elseChildren: z.array(InLoopItemSchema).min(1).optional().describe("Shown instead when the condition doesn't hold"),
  }),
);

export const InLoopItemSchema: z.ZodType<InLoopItem> = z.lazy(() =>
  z.union([InLoopQuestionItemSchema, LayoutItemSchema, EndItemSchema, InLoopBranchItemSchema]),
);

/**
 * A `for unit in ...` loop. Which of the coder's units it includes is
 * described by `units` (unitLoop.ts) and `order`. Children can only be
 * in-loop items (questions, layouts, end items, branches): no nested loops.
 * With a `condition`, coders only get the loop if it holds.
 */
export const UnitLoopItemSchema = z.object({
  type: z.literal("unit_loop"),
  /** Shown in the editor and in exports; the loop has no name (it is identified by its position, see `unitLoops`). */
  label: z.string().optional().describe("Shown in the editor and in exports"),
  condition: ConditionSchema.optional().describe(
    "Coders get the loop only if this holds: a script over earlier answers ($var)",
  ),
  ...UnitLoopDistributionShape,
  children: z.array(InLoopItemSchema).min(1, "A unit_loop must have at least one child item"),
});
export type UnitLoopItem = z.infer<typeof UnitLoopItemSchema>;

/**
 * Items outside unit loops: questions, experiments, branches, unit loops
 * (only at the top level), end items (only in a branch) and the Study entry
 * (first: `session.ts`). validation.ts checks where each may be.
 */
export type TopLevelItem =
  | TopLevelQuestionItem
  | ExperimentItem
  | UnitLoopItem
  | EndItem
  | SessionItem
  | {
      type: "branch";
      label?: string;
      condition: Condition;
      children: TopLevelItem[];
      elseChildren?: TopLevelItem[];
    };

/**
 * A branch: items only some coders get, shown only if its `condition`
 * holds, with `elseChildren` shown instead when it doesn't. The label is
 * for the researcher.
 */
export const TopLevelBranchItemSchema: z.ZodType<Extract<TopLevelItem, { type: "branch" }>> = z.lazy(() =>
  z.object({
    type: z.literal("branch"),
    label: BranchLabelSchema,
    condition: BranchConditionSchema,
    children: z.array(TopLevelItemSchema).min(1, "A branch must have at least one item"),
    elseChildren: z
      .array(TopLevelItemSchema)
      .min(1)
      .optional()
      .describe("Shown instead when the condition doesn't hold"),
  }),
);

export const TopLevelItemSchema: z.ZodType<TopLevelItem> = z.lazy(() =>
  z.union([
    TopLevelQuestionItemSchema,
    ExperimentItemSchema,
    UnitLoopItemSchema,
    EndItemSchema,
    SessionItemSchema,
    TopLevelBranchItemSchema,
  ]),
);

/** Any branch (outside or inside a loop). */
export type BranchItem = Extract<TopLevelItem | InLoopItem, { type: "branch" }>;

/** The items a branch or loop holds: its children, and a branch's else children after them. */
export function innerItems(item: { children?: readonly unknown[]; elseChildren?: readonly unknown[] }): DesignItem[] {
  return itemLists(item).flatMap((l) => l.list);
}

/**
 * Any design item anywhere in the tree.
 */
export type DesignItem = TopLevelItem | InLoopItem;

/** An item's name; branches, unit loops, layouts and the Study entry have none. */
export function itemName(item: DesignItem): string | undefined {
  return item.type === "branch" || item.type === "unit_loop" || item.type === "session" || item.type === "layout"
    ? undefined
    : item.name;
}

/**
 * The unit loops of a design in document order, with their key: their
 * position (`"1"`, `"2"`, ...). The key identifies a loop within one
 * design version (the coder API's `/loop/:loop`, progress, distribution
 * state).
 */
export function unitLoops(items: readonly unknown[]): { key: string; loop: UnitLoopItem }[] {
  const loops: { key: string; loop: UnitLoopItem }[] = [];
  forEachItem(items, (item) => {
    if (item.type === "unit_loop") loops.push({ key: String(loops.length + 1), loop: item as UnitLoopItem });
    if (item.type !== "branch") return "skip";
  });
  return loops;
}

/** How a loop is called in the editor, progress and exports: its label, or "Unit loop <key>". */
export function loopTitle(loop: { label?: string }, key: string): string {
  return loop.label?.trim() || `Unit loop ${key}`;
}
