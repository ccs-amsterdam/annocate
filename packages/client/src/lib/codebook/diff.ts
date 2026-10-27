import { collectQuestions, questionValues, type CodebookItem, type InLoopItem, type TopLevelItem } from "@annotinder/contracts";

export type CodebookChangeKind = "added" | "removed" | "changed" | "moved";

export interface CodebookChange {
  kind: CodebookChangeKind;
  name: string;
  type: CodebookItem["type"];
  /** Name of the containing loop or condition; null at the top level. */
  parent: string | null;
}

interface Located {
  item: CodebookItem;
  parent: string | null;
}

/** Item name -> item and container, for every item in the tree. */
function locate(items: (TopLevelItem | InLoopItem)[], parent: string | null = null, out = new Map<string, Located>()) {
  for (const item of items) {
    out.set(item.name, { item, parent });
    if ("children" in item && Array.isArray(item.children)) locate(item.children, item.name, out);
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
 * name, which is unique in a codebook). In document order: removed items in
 * the order of `before`, then the rest in the order of `after`.
 */
export function diffCodebooks(
  before: (TopLevelItem | InLoopItem)[],
  after: (TopLevelItem | InLoopItem)[],
): CodebookChange[] {
  const old = locate(before);
  const now = locate(after);
  const changes: CodebookChange[] = [];

  for (const [name, { item, parent }] of old) {
    if (!now.has(name)) changes.push({ kind: "removed", name, type: item.type, parent });
  }
  for (const [name, { item, parent }] of now) {
    const prev = old.get(name);
    if (!prev) changes.push({ kind: "added", name, type: item.type, parent });
    else if (prev.parent !== parent) changes.push({ kind: "moved", name, type: item.type, parent });
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
  }
  return warnings;
}
