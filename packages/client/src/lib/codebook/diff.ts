import { collectQuestions, optionLabel, questionValues, type AnyVariableType, type CodebookItem, type InLoopItem, type TopLevelItem } from "@annotinder/contracts";
import { itemTitle } from "./conditions";

export type CodebookChangeKind = "added" | "removed" | "changed" | "moved";

export interface CodebookChange {
  kind: CodebookChangeKind;
  /** The item's name, or for a condition its label or condition (`itemTitle`). */
  name: string;
  type: CodebookItem["type"];
  /** Name of the containing loop or condition; null at the top level. */
  parent: string | null;
}

interface Located {
  item: CodebookItem;
  /** The container's title (`itemTitle`); null at the top level. */
  parent: string | null;
  /** The container's identity ("" at the top level). */
  parentId: string;
}

/**
 * Identity -> item and container, for every item in the tree. Items are
 * identified by name; conditions and unit loops have none, so by place:
 * the nth condition (or loop) in their container.
 */
function locate(
  items: (TopLevelItem | InLoopItem)[],
  container: { id: string; title: string } | null = null,
  out = new Map<string, Located>(),
) {
  const counts = { condition: 0, unit_loop: 0 };
  for (const item of items) {
    const parentId = container?.id ?? "";
    const id = item.type === "condition" || item.type === "unit_loop" ? `${parentId}/${item.type} ${counts[item.type]++}` : item.name;
    out.set(id, { item, parent: container?.title ?? null, parentId });
    if ("children" in item && Array.isArray(item.children)) locate(item.children, { id, title: itemTitle(item) }, out);
  }
  return out;
}

/** The item's own content, without its children (those are compared separately). */
function ownContent(item: CodebookItem): string {
  const own: Record<string, unknown> = { ...item };
  delete own.children;
  return JSON.stringify(own);
}

/**
 * What changed between two codebooks, item by item (items are matched by
 * name, which is unique in a codebook; conditions by place). In document order: removed items in
 * the order of `before`, then the rest in the order of `after`.
 */
export function diffCodebooks(
  before: (TopLevelItem | InLoopItem)[],
  after: (TopLevelItem | InLoopItem)[],
): CodebookChange[] {
  const old = locate(before);
  const now = locate(after);
  const changes: CodebookChange[] = [];

  for (const [id, { item, parent }] of old) {
    if (!now.has(id)) changes.push({ kind: "removed", name: itemTitle(item), type: item.type, parent });
  }
  for (const [id, { item, parent, parentId }] of now) {
    const prev = old.get(id);
    const name = itemTitle(item);
    if (!prev) changes.push({ kind: "added", name, type: item.type, parent });
    else if (prev.parentId !== parentId) changes.push({ kind: "moved", name, type: item.type, parent });
    else if (ownContent(prev.item) !== ownContent(item)) changes.push({ kind: "changed", name, type: item.type, parent });
  }
  return changes;
}

const SUMMARY_VERBS: Record<CodebookChangeKind, string> = {
  added: "Added",
  changed: "changed",
  moved: "moved",
  removed: "removed",
};

/** A one-line description of the changes, as a starting point for a version note. */
export function summarizeChanges(changes: CodebookChange[], maxLength = 200): string {
  const parts: string[] = [];
  for (const kind of ["added", "changed", "moved", "removed"] as const) {
    const names = changes.filter((c) => c.kind === kind).map((c) => c.name);
    if (names.length > 0) parts.push(`${SUMMARY_VERBS[kind]} ${names.join(", ")}`);
  }
  const summary = parts.join("; ");
  const sentence = summary.charAt(0).toUpperCase() + summary.slice(1);
  return sentence.length > maxLength ? `${sentence.slice(0, maxLength - 1)}…` : sentence;
}

/**
 * Questions whose stored values change meaning (docs/client.md §2): option
 * values removed, or a question that changed type.
 * Earlier answers with those values no longer fit, as if the question was
 * renamed.
 */
export function valueChanges(before: (TopLevelItem | InLoopItem)[], after: (TopLevelItem | InLoopItem)[]): string[] {
  const old = collectQuestions(before).questions;
  const warnings: string[] = [];
  for (const [name, variable] of collectQuestions(after).questions) {
    const prev = old.get(name);
    if (!prev) continue;
    if (prev.type !== variable.type) {
      warnings.push(`'${name}' changed from ${prev.type} to ${variable.type}: earlier answers no longer fit.`);
      continue;
    }
    const now = new Set(questionValues(variable) ?? []);
    const removed = (questionValues(prev) ?? []).filter((v) => !now.has(v));
    if (removed.length > 0) {
      const list = removed.map((v) => JSON.stringify(v)).join(", ");
      warnings.push(`'${name}' no longer has the value${removed.length === 1 ? "" : "s"} ${list}: earlier answers with ${removed.length === 1 ? "it" : "them"} no longer fit.`);
    }
    // An option that moved to another value (ordinal options renumbered when moved, or a
    // nominal value edited): the earlier answers with its old value now mean another option.
    const labelsBefore = labels(prev);
    const labelsNow = labels(variable);
    for (const [value, label] of labelsBefore) {
      const now = labelsNow.get(value);
      if (now === undefined || now === label || ![...labelsNow.values()].includes(label)) continue;
      warnings.push(`'${name}': the value ${JSON.stringify(value)} was "${label}" and is now "${now}": earlier answers ${JSON.stringify(value)} will read as "${now}".`);
    }
  }
  return warnings;
}

/** A question's options: value -> label. */
function labels(variable: AnyVariableType): Map<unknown, string> {
  const options = "options" in variable && Array.isArray(variable.options) ? variable.options : [];
  return new Map(options.map((o) => [o.value, optionLabel(o)]));
}
