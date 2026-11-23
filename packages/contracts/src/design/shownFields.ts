import { unitLoops, type UnitLoopItem } from "./item.js";
import { forEachItem } from "./walk.js";
import { inviteOf, sessionItem } from "./session.js";
import { selectsUnits } from "./assignment.js";
import { CODER_SET, CONDITION_SET, PART_SET, TEST_SET, isRoleColumn, type RoleColumn } from "../sets.js";
import { UNIT_BUILTINS, answerColumn, feedbackColumn } from "../unitFields.js";
import { extractReferences, type Reference } from "./references.js";
import { expandSnippets } from "./snippets.js";
import { loopSnippets } from "./layoutItems.js";
import { allTemplateReferences } from "./templateBlocks.js";

/**
 * Every reference a unit loop makes: in its layout items (each with its
 * snippets), question texts, conditions and end messages. References are always literal (validation refuses
 * `$unit[...]`), so the list is complete. Span questions' fields go to
 * `spanFields`.
 */
function loopReferences(loop: UnitLoopItem, spanFields?: (field: string) => void): Reference[] {
  const refs: Reference[] = [];
  // Texts in the loop may use any of its layouts' snippets
  const snippets = loopSnippets(loop.children);
  const addTemplate = (source: unknown, own: Record<string, string> = snippets) =>
    typeof source === "string" && refs.push(...allTemplateReferences(expandSnippets(source, own).source));
  const addScript = (source: unknown) =>
    typeof source === "string" && refs.push(...extractReferences(source).references);

  forEachItem(loop.children, (item) => {
    if (item.type === "block") {
      addScript(item.condition?.script);
      return;
    }
    if (item.type === "layout") {
      addTemplate(item.template, item.snippets ?? {});
    } else if (item.type === "end") {
      addTemplate(item.message);
    } else if ("variable" in item && item.variable) {
      const variable = item.variable as {
        question?: unknown;
        type?: string;
        fields?: unknown;
      };
      addTemplate(variable.question);
      addTemplate((item as { instruction?: unknown }).instruction);
      if (spanFields && variable.type === "span" && Array.isArray(variable.fields)) {
        for (const f of variable.fields) if (typeof f === "string") spanFields(f);
      }
    }
    return "skip";
  });
  return refs;
}

/**
 * The unit fields a design shows or uses (docs/architecture.md §8.4): every
 * `$unit.<field>` in its unit loops, and the columns of span questions.
 * Coders are sent only these fields, and a unit version is a unit as it
 * looks with them.
 */
export function shownUnitFields(items: readonly unknown[]): string[] {
  const fields = new Set<string>();
  for (const { loop } of unitLoops(items)) {
    for (const ref of loopReferences(loop, (f) => fields.add(f))) if (ref.ns === "unit") fields.add(ref.path[0]);
  }
  return [...fields];
}

/**
 * Per unit loop (by key), the questions its units depend on: every `$var`
 * the loop refers to that isn't one of its own questions (so a coder-level
 * question). A coder's answers to them are frozen once they coded a unit in
 * the loop (docs/architecture.md §7, "Frozen answers"): changing them would change
 * what those units were coded with.
 */
export function loopDependencies(items: readonly unknown[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const { key, loop } of unitLoops(items)) {
    const own = new Set<string>();
    forEachItem(loop.children, (item) => {
      if (item.type === "block") return;
      if ("name" in item && typeof item.name === "string") own.add(item.name);
      return "skip";
    });
    const names = new Set(
      loopReferences(loop).flatMap((r) => (r.ns === "var" && !own.has(r.path[0]) ? [r.path[0]] : [])),
    );
    out.set(key, [...names]);
  }
  return out;
}

/**
 * How a design uses each unit field (docs/architecture.md §8.4):
 * - `shown`: in a layout, a question or instruction text, an end message,
 *   or selected in by a span question: coders see it;
 * - `sent`: only in conditions the browser evaluates: sent to coders, not
 *   shown (anyone looking behind the scenes can see it);
 * - `server`: answer and feedback columns of checked questions, and the
 *   columns with a role: never sent (practice answers and feedback come
 *   with practice units only). The test set is used by every unit loop (it
 *   places test units); the set columns by what selects units by them.
 * Fields not in the map aren't used.
 */
export type FieldUse = "shown" | "sent" | "server";

export function fieldUsage(items: readonly unknown[]): Map<string, FieldUse> {
  const usage = new Map<string, FieldUse>();
  const rank: Record<FieldUse, number> = { shown: 3, sent: 2, server: 1 };
  const use = (field: string, how: FieldUse) => {
    const now = usage.get(field);
    if (!now || rank[how] > rank[now]) usage.set(field, how);
  };
  for (const { loop } of unitLoops(items)) {
    use(TEST_SET, "server");
    // A field referred to more often than in the loop's scripts is in a text coders see
    const counts = new Map<string, number>();
    for (const ref of loopReferences(loop, (f) => use(f, "shown")))
      if (ref.ns === "unit") counts.set(ref.path[0], (counts.get(ref.path[0]) ?? 0) + 1);
    for (const [field, n] of counts) use(field, n > scriptCount(loop, field) ? "shown" : "sent");
    const units = loop.units;
    for (const q of units?.goldCheck?.questions ?? []) use(answerColumn(q), "server");
    for (const q of units?.practiceCheck?.questions ?? []) {
      use(answerColumn(q), "server");
      use(feedbackColumn(q), "server");
    }
  }
  // The set columns the session's units come from
  for (const column of designSetColumns(items)) use(column, "server");
  return usage;
}

/**
 * The set columns a design selects units by (docs/plans/unit-sets.md):
 * `coder_set` for specific coders, `condition_set` for an experiment that
 * selects units, `part_set` for loops that show a part.
 */
export function designSetColumns(items: readonly unknown[]): RoleColumn[] {
  const columns = new Set<RoleColumn>();
  if (inviteOf(sessionItem(items)).mode === "coders") columns.add(CODER_SET);
  forEachItem<{ type?: unknown; units?: unknown }>(items, (it) => {
    if (selectsUnits(it)) columns.add(CONDITION_SET);
    if (it.type === "unit_loop" && typeof (it.units as { part?: unknown } | undefined)?.part === "string")
      columns.add(PART_SET);
  });
  return [...columns];
}

/** How often a loop's scripts (its conditions) refer to `$unit.<field>`. */
function scriptCount(loop: UnitLoopItem, field: string): number {
  let n = 0;
  const count = (script: unknown) => {
    for (const ref of extractReferences(String(script ?? "")).references)
      if (ref.ns === "unit" && ref.path[0] === field) n++;
  };
  forEachItem(loop.children, (item) => {
    if (item.type !== "block") return "skip";
    count(item.condition?.script);
  });
  return n;
}

/**
 * Unit fields the design uses but doesn't declare (`$unit.id` and
 * `$unit.test_set`, which AnnoTinder provides, aside; and the columns with a
 * role: deploying checks those against the units, sets.ts on the server).
 */
export function undeclaredFields(items: readonly unknown[], declared: readonly { name: string }[]): string[] {
  const names = new Set(declared.map((f) => f.name));
  return [...fieldUsage(items).keys()].filter((f) => !names.has(f) && !UNIT_BUILTINS.includes(f) && !isRoleColumn(f));
}
