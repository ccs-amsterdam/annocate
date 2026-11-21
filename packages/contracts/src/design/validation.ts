import { TopLevelItemSchema, loopTitle, unitLoops, type DesignItem } from "./item.js";
import type { AnyVariableType } from "./variableTypes.js";
import { sameValue } from "./options.js";
import { parseSimpleCondition, simpleConditionCalls, type Condition, type SimpleCall } from "./condition.js";
import {
  CHECKABLE_TYPES,
  goldColumn,
  practiceColumn,
  practiceMessageColumn,
  supportsAgreement,
  type LoopUnits,
} from "./unitLoop.js";
import {
  RESERVED_SESSION_NAMES,
  STUDY_END_NAME,
  sessionColumns,
  sessionItem,
  sessionNames,
  type SessionItem,
} from "./session.js";
import { loopShareColumns } from "./assignment.js";
import { expandSnippets, usesSnippets } from "./snippets.js";
import {
  parseTemplateBlocks,
  templateNames,
  type DisplayNode,
  type FromStage,
  type TemplateNode,
} from "./templateBlocks.js";
import {
  METHOD_TEXT,
  describeQuestion,
  questionValues,
  extractReferences,
  parseTemplate,
  referenceShape,
  referenceText,
  type Reference,
  type ReferenceError,
  type ReferenceShape,
} from "./references.js";

export interface DesignIssue {
  path: (string | number)[];
  message: string;
  /** A warning doesn't block saving. */
  warning?: boolean;
}

type Path = (string | number)[];
/** An item as stored: any field may be missing; conditions have no name. */
type RawItem = Partial<DesignItem> & { name?: string };

/** Where references are checked, and what they may refer to there. */
interface RefContext {
  path: Path;
  /** The unit loop around this point (null at the top level). */
  loop: string | null;
  /** Questions answered before this point. */
  available: ReadonlySet<string>;
  /** The snippets of the loop around this point (`[[name]]` in its templates). */
  snippets?: Readonly<Record<string, string>>;
  /** The question whose text this is (it can't refer to itself). */
  self?: string;
  /** Questions inside the condition being checked. */
  inside?: ReadonlySet<string>;
  /** In a loop's layout: the loop's questions in order (`::: from` stages make the ones before them available). */
  loopOrder?: string[];
}

/**
 * Validates a design's items array:
 * 1. Validates each top-level item against the TopLevelItemSchema
 * 2. Enforces unique names across all items in the tree
 * 3. Enforces that span variable references in relations exist in preceding items
 * 4. Enforces structural rules (unit_loop cannot be nested, etc.)
 * 5. Checks every reference (`$var`, `$unit`; snippets put in first) in conditions,
 *    the layout template and question texts:
 *    it must exist, be available at that point (asked before, not in
 *    another loop), and fit the question's type. Agreement rules must refer
 *    to questions inside the loop, span columns must be shown as plain text.
 *
 * In simple conditions (condition.ts) the helper arguments are checked too.
 * Script syntax isn't checked here (no JS engine); the admin editor does that.
 */
export function validateDesignItems(items: unknown[]): DesignIssue[] {
  return [...schemaIssues(items), ...semanticIssues(items)];
}

/** Zod schema validation of each item. */
function schemaIssues(items: unknown[]): DesignIssue[] {
  const issues: DesignIssue[] = [];
  for (let i = 0; i < items.length; i++) {
    const result = TopLevelItemSchema.safeParse(items[i]);
    if (!result.success) {
      for (const err of flattenUnions(result.error.issues))
        issues.push({ path: [i, ...err.path], message: err.message });
    }
  }
  return issues;
}

interface RawIssue {
  code?: string;
  path: PropertyKey[];
  message: string;
  errors?: RawIssue[][];
}

/**
 * Item types are a union, so zod reports a bad item as "Invalid input" with
 * the issues of every member. This keeps the member whose `type` matched
 * (the one with the fewest issues if several did), recursively, so the
 * message is about the actual problem.
 */
function flattenUnions(
  issues: readonly RawIssue[],
  prefix: (string | number)[] = [],
): { path: (string | number)[]; message: string }[] {
  return issues.flatMap((issue) => {
    const path = [...prefix, ...issue.path.filter((p): p is string | number => typeof p !== "symbol")];
    if (issue.code !== "invalid_union" || !issue.errors?.length) return [{ path, message: issue.message }];
    const matching = issue.errors.filter(
      (branch) => !branch.some((e) => e.path.length === 1 && (e.path[0] === "type" || e.path[0] === "mode")),
    );
    if (matching.length === 0) return [{ path, message: issue.message }];
    const best = matching.reduce((a, b) => (b.length < a.length ? b : a));
    return flattenUnions(best, path);
  });
}
/** What the item schemas can't check: names, structure, references (see validateDesignItems). */
export function semanticIssues(items: unknown[]): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const { questions, loopOf } = collectQuestions(items);
  /** Loop key -> how messages call it. */
  const loopTitles = new Map(unitLoops(items).map(({ key, loop }) => [key, loopTitle(loop, key)]));
  let loopCount = 0;
  const seenNames = new Map<string, Path>();
  const spanVariables = new Set<string>();
  /** Coder-level questions seen so far. */
  const coderAvailable = new Set<string>();
  /** Questions of the current loop seen so far. */
  let loopAvailable = new Set<string>();
  /** `$session` names (declared parameters, conditions and the built-in ones). */
  const sessionNamed = new Set(sessionNames(items));
  /** Set columns that select a session's units (the coders' column, random conditions'): column -> what. */
  const linkedColumns = new Map(
    sessionColumns(sessionItem(items)).map((c) => [
      c.column,
      c.name === "coder" ? "the coders" : `condition '${c.name}'`,
    ]),
  );

  const seen = new Set<string>();
  const issue = (path: Path, message: string, warning = false) => {
    // A reference can be checked twice (as text and as a value); say it once.
    const key = `${path.join("/")}\u0000${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push(warning ? { path, message, warning } : { path, message });
  };

  function checkRef(ref: Reference, ctx: RefContext): ReferenceShape | null {
    const text = referenceText(ref);
    // Session values exist everywhere: the Session item's parameters and the built-in ones.
    if (ref.ns === "session") {
      const name = ref.path[0];
      if (!sessionNamed.has(name))
        return (issue(ctx.path, `${text}: no session parameter '${name}' (declare it in the Session item)`), null);
      return referenceShape(questions, ref);
    }
    if (ref.ns !== "var") {
      if (ctx.loop === null) return (issue(ctx.path, `${text} can only be used inside a unit loop`), null);
      return referenceShape(questions, ref);
    }
    const name = ref.path[0];
    const where = loopOf.get(name);
    if (where === undefined) return (issue(ctx.path, `${text}: '${name}' is not a question`), null);
    if (name === ctx.self) return (issue(ctx.path, `${text}: a question can't refer to itself`), null);
    if (ctx.inside?.has(name)) return (issue(ctx.path, `${text}: '${name}' is inside this condition`), null);
    if (where !== null && where !== ctx.loop)
      return (
        issue(ctx.path, `${text}: '${name}' is a question of another unit loop (${loopTitles.get(where)})`),
        null
      );
    if (!ctx.available.has(name)) {
      // In a layout, the loop's own answers exist from their question on: `::: from` says from where.
      const next = ctx.loopOrder?.[ctx.loopOrder.indexOf(name) + 1];
      if (ctx.loopOrder?.includes(name)) {
        return (
          issue(
            ctx.path,
            `${text}: '${name}' is answered in this loop; use it inside ${next ? `::: from ${next}` : "a ::: from block of a later question"}`,
          ),
          null
        );
      }
      return (issue(ctx.path, `${text}: '${name}' is asked after this point`), null);
    }
    const shape = referenceShape(questions, ref);
    if (!shape.ok) issue(ctx.path, shape.reason);
    else if (shape.warning) issue(ctx.path, shape.warning, true);
    return shape;
  }

  const refErrors = (errors: ReferenceError[], path: Path) => errors.forEach((e) => issue(path, e.message));

  function checkScript(script: string, ctx: RefContext) {
    const { references, errors } = extractReferences(script);
    refErrors(errors, ctx.path);
    for (const ref of references) checkRef(ref, ctx);
  }

  /** The arguments of a helper call in a simple condition: their number, and that they are values of the question. */
  function checkCall(call: SimpleCall, ctx: RefContext) {
    const variable = questions.get(call.question);
    const path = call.item ? [call.question, "items", call.item, call.method] : [call.question, call.method];
    const shape = variable && referenceShape(questions, { ns: "var", path, call: true });
    if (!variable || !shape?.ok) return;
    for (const problem of callArgumentProblems(variable, call)) issue(ctx.path, problem);
  }

  function checkCondition(condition: Condition | undefined, ctx: RefContext) {
    if (!condition || typeof condition !== "object") return;
    const path = [...ctx.path, "script"];
    if (!condition.script?.trim()) issue(path, "The script is empty");
    if (usesSnippets(condition.script ?? ""))
      issue(
        path,
        "Snippets ([[name]]) can only be used in a unit loop's layout and its questions' texts; in a layout, `::: if [[name]]` works",
      );
    checkScript(condition.script ?? "", { ...ctx, path });
    const simple = parseSimpleCondition(condition.script ?? "");
    if (simple) for (const call of simpleConditionCalls(simple)) checkCall(call, { ...ctx, path });
  }

  /**
   * Checks a template's blocks (their structure and conditions; `from`
   * stages only in a layout). Returns the context at a place in it: inside
   * `from` stages, the loop's questions before theirs are available too.
   */
  function checkBlocks(
    source: string,
    ctx: RefContext,
    kind: "layout" | "text" | "set" | "url",
  ): (at: number) => RefContext {
    // Blocks: their conditions, and `from` stages, which make the loop's
    // questions before their question available inside them.
    const blocks = parseTemplateBlocks(source);
    refErrors(blocks.errors, ctx.path);
    if (blocks.hasBlocks && (kind === "set" || kind === "url")) issue(ctx.path, "Blocks (:::) can't be used here");
    const stages: FromStage[] = [];
    const conditions: { script: string; at: number }[] = [];
    const walkBlocks = (nodes: TemplateNode[]) => {
      for (const node of nodes) {
        if (node.type === "if") {
          for (const b of node.branches) {
            if (b.script) conditions.push({ script: b.script, at: b.start });
            walkBlocks(b.body);
          }
        } else if (node.type === "from") {
          for (const stage of node.stages) {
            stages.push(stage);
            walkBlocks(stage.body);
          }
        } else if (node.type === "style" || node.type === "display") walkBlocks(node.body);
      }
    };
    walkBlocks(blocks.nodes);
    for (const stage of stages) {
      if (kind !== "layout") issue(ctx.path, "::: from only works in a unit layout");
      else if (!ctx.loopOrder?.includes(stage.question))
        issue(ctx.path, `::: from ${stage.question}: '${stage.question}' is not a question of this loop`);
    }
    const ctxAt = (at: number): RefContext => {
      const order = ctx.loopOrder ?? [];
      const before = stages
        .filter((stage) => at >= stage.bodyStart && at < stage.bodyEnd && order.includes(stage.question))
        .flatMap((stage) => order.slice(0, order.indexOf(stage.question)));
      return before.length ? { ...ctx, available: new Set([...ctx.available, ...before]) } : ctx;
    };
    for (const { script, at } of conditions) {
      const here = ctxAt(at);
      checkScript(script, here);
      const simple = parseSimpleCondition(script);
      if (simple) for (const call of simpleConditionCalls(simple)) checkCall(call, here);
    }
    return ctxAt;
  }

  /**
   * Checks a template. Returns its names (templateNames): what a question's
   * `field` can point at, and what span questions can select in.
   */
  function checkTemplate(
    raw: unknown,
    ctx: RefContext,
    kind: "layout" | "text" | "set" | "url",
  ): { shown: Set<string>; selectable: Set<string> } {
    const empty = { shown: new Set<string>(), selectable: new Set<string>() };
    if (typeof raw !== "string") return empty;
    // In a loop, snippets are put in first: the template is checked as it will be shown.
    let source = raw;
    if (ctx.snippets) {
      const expanded = expandSnippets(source, ctx.snippets);
      expanded.errors.forEach((e) => issue(ctx.path, e));
      source = expanded.source;
    } else if (usesSnippets(source)) {
      issue(ctx.path, "Snippets ([[name]]) can only be used in a unit loop's layout and its questions' texts");
    }
    const parsed = parseTemplate(source);
    refErrors(parsed.errors, ctx.path);

    const ctxAt = checkBlocks(source, ctx, kind);
    const displays = displayBlocks(source);

    for (const segment of parsed.segments) {
      if (segment.type !== "expression") continue;
      const here = ctxAt(segment.start);
      if (kind === "set" || kind === "url") {
        const what = kind === "url" ? "Redirect URLs" : "Set names";
        if (!segment.ref)
          issue(
            here.path,
            `${what} can only use ${kind === "url" ? "$var and $session" : "$var"} references, not {{ }}`,
          );
        else if (segment.ref.suffix) issue(here.path, `${what} can't use ::${segment.ref.suffix}`);
      } else {
        refErrors(extractReferences(segment.script).errors, here.path);
        // `{{ $unit.text::markdown }}`: the suffix goes after the braces.
        const inside = /::(text|markdown|image|html)\b/.exec(segment.script);
        if (!segment.ref && inside) issue(here.path, `A suffix goes after the }}: {{ ... }}::${inside[1]}`);
        const display = displays.find((d) => segment.start >= d.bodyStart && segment.start < d.bodyEnd);
        if (display && segment.suffix !== "text") {
          issue(
            here.path,
            `Inside a ::: ${display.kind} block values are put in as they are: leave out ::${segment.suffix}`,
          );
        }
      }
      for (const ref of segment.references) {
        const shape = checkRef(ref, here);
        if (kind === "set" && shape?.ok && shape.array)
          issue(here.path, `${referenceText(ref)} holds a list; a set name needs a single value`);
        if (kind === "url" && ref.ns === "unit")
          issue(here.path, `${referenceText(ref)}: redirect URLs can only use $var and $session references`);
      }
    }
    const named = displays.flatMap((d) => (d.name ? [d.name] : []));
    for (const name of new Set(named.filter((n, i) => named.indexOf(n) !== i))) {
      issue(ctx.path, `Two blocks are named '${name}': names must be unique`);
    }
    const names = templateNames(source);
    return { shown: new Set(names.shown), selectable: new Set(names.selectable) };
  }

  /** End items anywhere in the design: name -> outcome. */
  const endItems = new Map<string, unknown>();
  const collectEnds = (list: unknown) => {
    for (const raw of Array.isArray(list) ? list : []) {
      const it = raw as { type?: unknown; name?: unknown; outcome?: unknown; children?: unknown } | null;
      if (it?.type === "end" && typeof it.name === "string") endItems.set(it.name, it.outcome);
      collectEnds(it?.children);
    }
  };
  collectEnds(items);

  function checkLoop(item: RawItem, itemPath: Path, loopName: string) {
    const loop = item as {
      units?: Partial<LoopUnits> | null;
      children?: unknown;
      layout?: { template?: unknown; snippets?: Record<string, string> };
    };
    const loopQuestions = questionNames(loop.children);
    {
      const branch = loop.units && typeof loop.units === "object" ? loop.units : null;
      const path = [...itemPath, "units"];
      // Practice and gold: questions of this loop with answers compared by value; a gold screen-out at an end item
      const checks = { practice: branch?.practiceCheck, gold: branch?.goldCheck };
      for (const [kind, settings] of Object.entries(checks) as [
        "practice" | "gold",
        { questions?: unknown; health?: { end?: unknown } } | undefined,
      ][]) {
        if (!settings) continue;
        (Array.isArray(settings.questions) ? settings.questions : []).forEach((name: unknown, q) => {
          const at = [...path, `${kind}Check`, "questions", q];
          if (typeof name !== "string" || !loopQuestions.has(name))
            return issue(
              at,
              `${kind === "gold" ? "Gold" : "Practice"} question '${String(name)}' is not a question in this loop`,
            );
          const type = questions.get(name)?.type;
          if (!(CHECKABLE_TYPES as readonly string[]).includes(type ?? "")) {
            issue(
              at,
              `'${name}' can't be checked against a right answer: ${describeQuestion(questions.get(name)!)} (use nominal, ordinal, swipe, numeric or confirm)`,
            );
          }
        });
        // The right answers must never reach coders: no layout or question may show their columns
        const shown = JSON.stringify([loop.layout, loop.children]);
        for (const name of Array.isArray(settings.questions) ? (settings.questions as unknown[]) : []) {
          if (typeof name !== "string") continue;
          const columns = kind === "gold" ? [goldColumn(name)] : [practiceColumn(name), practiceMessageColumn(name)];
          for (const column of columns) {
            if (new RegExp(`\\$unit\\.${column}\\b`).test(shown))
              issue(
                [...path, `${kind}Check`],
                `The answer column ${column} is shown to coders (in the layout or a question): it must stay hidden`,
              );
          }
        }
        const end = settings.health?.end;
        if (typeof end === "string") {
          const found = endItems.get(end);
          if (!found)
            issue(
              [...path, `${kind}Check`, "health", "end"],
              `No end item '${end}': the session ends there when health runs out`,
            );
          else if (found !== "screenout")
            issue(
              [...path, `${kind}Check`, "health", "end"],
              `End item '${end}' should be a screen-out (coders who fail the gold checks)`,
            );
        }
      }
    }

    const snippets = loop.layout?.snippets ?? {};
    const names = checkTemplate(
      loop.layout?.template,
      {
        path: [...itemPath, "layout", "template"],
        loop: loopName,
        available: coderAvailable,
        snippets,
        loopOrder: [...loopQuestions],
      },
      "layout",
    );
    const idHint = (id: string) =>
      id.startsWith("unit.") ? ` (as $${id})` : id.startsWith("var.") ? "" : ` (as a ::: block named '${id}')`;
    forEachQuestion(loop.children, [...itemPath, "children"], (q, path) => {
      const variable = q.variable as { type?: string; fields?: unknown; focus?: unknown } | undefined;
      for (const id of Array.isArray(variable?.focus) ? variable.focus : []) {
        if (typeof id === "string" && !names.shown.has(id))
          issue([...path, "variable", "focus"], `'${id}' is not shown in the layout${idHint(id)}`);
      }
      for (const field of variable?.type === "span" && Array.isArray(variable.fields) ? variable.fields : []) {
        if (typeof field !== "string" || names.selectable.has(`unit.${field}`)) continue;
        issue(
          [...path, "variable", "fields"],
          `Span question '${q.name}' selects text in the unit field '${field}', but the layout doesn't show it as plain text ($unit.${field})`,
        );
      }
    });
    return snippets;
  }

  /** The Study entry: first, once, top level; its URL parameters' names and keys unique; the invitation's agreement question. */
  function checkSession(item: RawItem, itemPath: Path, index: number, nested: boolean) {
    if (nested || index !== 0) issue([...itemPath, "type"], "The Session item comes first in the design, at the top");
    if (items.filter((i) => (i as { type?: unknown } | null)?.type === "session").length > 1)
      issue([...itemPath, "type"], "A design has one Session item");
    const session = item as unknown as Partial<SessionItem>;
    const params = Array.isArray(session.urlParams) ? session.urlParams : [];
    const names = params.map((p) => p?.name);
    names.forEach((name, i) => {
      if (name && names.indexOf(name) !== i)
        issue([...itemPath, "urlParams", i, "name"], `Two URL parameters are named '${name}'`);
    });
    const invite = session.invite;
    const keys = params.map((p) => p?.param ?? p?.name);
    if (invite?.mode === "crowd" && invite.coderParam) keys.push(invite.coderParam.param);
    keys.forEach((key, i) => {
      if (keys.indexOf(key) !== i) issue([...itemPath, "urlParams"], `Two URL parameters use the key '${key}'`);
      if (key === "source")
        issue([...itemPath, "urlParams"], "'source' is always accepted as a URL parameter (tracking): use another key");
    });
    params.forEach((p, i) => {
      if (p?.default !== undefined && p.values && !p.values.some((v) => v.value === p.default))
        issue([...itemPath, "urlParams", i, "default"], `The default '${p.default}' is not one of the values`);
    });
    // Unit settings without a unit loop: kept, but not used (yet)
    const hasLoop = items.some((i) => (i as { type?: unknown } | null)?.type === "unit_loop");
    if (!hasLoop && (invite?.mode === "coders" || (invite?.mode === "crowd" && invite.share)))
      issue(
        [...itemPath, "invite"],
        invite.mode === "coders"
          ? "Specific coders each get their own units, but the design has no unit loop yet: until it has, coders get no units (their links work)"
          : "The crowd shares the units, but the design has no unit loop yet: until it has, sharing isn't used",
        true,
      );
    // A crowd's agreement rule: a question with one categorical answer, in a unit loop
    const agreement = invite?.mode === "crowd" && hasLoop ? invite.share?.until?.on : undefined;
    if (typeof agreement === "string") {
      const at = [...itemPath, "invite", "share", "until", "on"];
      const variable = questions.get(agreement);
      if (!variable || loopOf.get(agreement) === null)
        issue(at, `Agreement question '${agreement}' is not a question in a unit loop`);
      else if (!supportsAgreement(variable))
        issue(
          at,
          `Agreement needs a question with one categorical answer (nominal without multiple answers, ordinal or swipe); "${agreement}" is ${describeQuestion(variable)}`,
        );
    }
  }

  /** A computed item: outside loops; a random one linked to a column selects units (one value per column); stratified on earlier answers or session values. */
  function checkComputed(item: RawItem, itemPath: Path, inLoop: boolean, available: ReadonlySet<string>) {
    const variable = (item as { variable?: unknown }).variable as
      { type?: unknown; units?: unknown; stratify?: unknown } | undefined;
    if (inLoop)
      return issue([...itemPath, "type"], `Computed item '${item.name}' can only be used outside a unit loop`);
    if (variable?.type !== "random") return;
    const units = typeof variable.units === "string" ? variable.units : undefined;
    if (
      units &&
      item.name &&
      (sessionNamed.has(item.name) || (RESERVED_SESSION_NAMES as readonly string[]).includes(item.name))
    ) {
      issue(
        [...itemPath, "name"],
        `Computed item '${item.name}' selects units: its name can't also be a session value`,
      );
    }
    if (units && linkedColumns.has(units)) {
      issue(
        [...itemPath, "variable", "units"],
        `Column '${units}' already selects units for ${linkedColumns.get(units)}: use a column each`,
      );
    } else if (units && item.name) {
      // Drawn independently, two values on one column would rarely leave a session any units
      linkedColumns.set(units, `computed item '${item.name}'`);
    }
    // Groups for a balanced draw: answers given before it, or session values
    for (const name of Array.isArray(variable.stratify) ? (variable.stratify as string[]) : []) {
      const known = name.startsWith("session.") ? sessionNamed.has(name.slice("session.".length)) : available.has(name);
      if (!known)
        issue(
          [...itemPath, "variable", "stratify"],
          `Computed item '${item.name}': balanced within '${name}', which is not a question before it or a session value (session.<name>)`,
        );
    }
  }

  function walk(
    itemList: unknown[],
    currentPath: Path,
    loop: { name: string; snippets: Record<string, string> } | null,
  ) {
    if (!Array.isArray(itemList)) return;

    itemList.forEach((rawItem, index) => {
      if (!rawItem || typeof rawItem !== "object") return;
      const item = rawItem as RawItem;
      const itemPath = [...currentPath, index];
      const isQuestion = item.type === "question";
      const available = loop ? new Set([...coderAvailable, ...loopAvailable]) : coderAvailable;

      if (item.type === "session") {
        checkSession(item, itemPath, index, currentPath.length > 0);
        return;
      }

      // Check name validity and uniqueness (conditions have no name)
      if (item.type === "show_if" || item.type === "unit_loop") {
        // Nothing refers to them by name (a loop is identified by its position).
      } else if (!item.name || item.name.trim() === "") {
        issue([...itemPath, "name"], "Item name cannot be empty");
      } else {
        if (!/^[a-zA-Z0-9_]+$/.test(item.name)) {
          issue([...itemPath, "name"], `Name '${item.name}' contains invalid characters (letters, numbers and _ only)`);
        }
        if (item.name === STUDY_END_NAME)
          issue([...itemPath, "name"], `'${STUDY_END_NAME}' is the study's own end: choose another name`);
        if (seenNames.has(item.name)) issue([...itemPath, "name"], `Duplicate name '${item.name}'`);
        else seenNames.set(item.name, itemPath);
      }

      if (item.type === "computed") {
        checkComputed(item, itemPath, loop !== null, available);
        if (item.name && !loop) coderAvailable.add(item.name);
      }

      if (isQuestion) {
        const variable = item.variable as
          | {
              type?: string;
              question?: unknown;
              instruction?: unknown;
              from?: { variable?: string };
              to?: { variable?: string };
            }
          | undefined;
        // Check relation variable references
        if (variable?.type === "relation") {
          for (const end of ["from", "to"] as const) {
            const ref = variable[end]?.variable;
            if (ref && !spanVariables.has(ref)) {
              issue(
                [...itemPath, "variable", end, "variable"],
                `Relation '${end}' refers to '${ref}' which is not a preceding span question`,
              );
            }
          }
        }
        if (variable?.type === "span" && item.name) spanVariables.add(item.name);
        if (!loop && (item.variable as { focus?: unknown } | undefined)?.focus !== undefined) {
          issue([...itemPath, "variable", "focus"], "Focus only works for questions in a unit loop");
        }

        for (const field of ["question", "instruction"] as const) {
          checkTemplate(
            variable?.[field],
            {
              path: [...itemPath, "variable", field],
              loop: loop?.name ?? null,
              available,
              snippets: loop?.snippets,
              self: item.name,
            },
            "text",
          );
        }
        if (item.name) (loop ? loopAvailable : coderAvailable).add(item.name);
      }

      // Check structural rules
      if (item.type === "unit_loop") {
        const key = String(++loopCount);
        if (loop) issue([...itemPath, "type"], "A unit loop cannot be inside another unit loop");
        const snippets = checkLoop(item, itemPath, key);
        if (!item.children || item.children.length === 0) {
          issue([...itemPath, "children"], "A unit loop must have at least one item");
        } else if (!loop) {
          loopAvailable = new Set();
          walk(item.children, [...itemPath, "children"], { name: key, snippets });
          loopAvailable = new Set();
        }
      } else if (item.type === "show_if") {
        checkCondition(item.condition, {
          path: [...itemPath, "condition"],
          loop: loop?.name ?? null,
          available,
          snippets: loop?.snippets,
          inside: questionNames(item.children),
        });
        if (!item.children || item.children.length === 0) {
          issue([...itemPath, "children"], "A condition must have at least one child item");
        } else {
          walk(item.children, [...itemPath, "children"], loop);
        }
      } else if (item.type === "end") {
        const end = item as { message?: unknown; redirectUrl?: unknown };
        const ctx = { loop: loop?.name ?? null, available, snippets: loop?.snippets };
        // An end item's texts are shown outside the loop's layout: no snippets.
        checkTemplate(end.message, { ...ctx, snippets: undefined, path: [...itemPath, "message"] }, "text");
        checkTemplate(end.redirectUrl, { ...ctx, snippets: undefined, path: [...itemPath, "redirectUrl"] }, "url");
        if (typeof end.redirectUrl === "string" && !/^https?:\/\//.test(end.redirectUrl)) {
          issue([...itemPath, "redirectUrl"], "The redirect URL must start with https:// (or http://)");
        }
        if (
          typeof end.redirectUrl === "string" &&
          typeof (item as { redirectSetting?: unknown }).redirectSetting === "string"
        ) {
          issue([...itemPath, "redirectSetting"], "Give a redirect URL or a deployment setting, not both");
        }
      } else if (item.type === "question") {
        if (!loop && (item.variable?.type === "span" || item.variable?.type === "relation")) {
          issue(
            [...itemPath, "variable", "type"],
            `Question '${item.name}' with answer type '${item.variable.type}' can only be used inside a unit_loop`,
          );
        } else if (item.variable?.type === "unspecified") {
          issue([...itemPath, "variable", "type"], `Question '${item.name}' has no answer type yet: choose one`);
        }
      }
    });
  }

  walk(items, [], null);

  // The study's normal end: its texts may use the coder-level answers
  const studyIndex = items.findIndex((i) => (i as RawItem | null)?.type === "session");
  const studyEnd =
    studyIndex >= 0
      ? (items[studyIndex] as { end?: { message?: unknown; redirectUrl?: unknown; redirectSetting?: unknown } }).end
      : undefined;
  if (studyEnd) {
    const path = [studyIndex, "end"];
    const ctx = { loop: null, available: coderAvailable, snippets: undefined };
    checkTemplate(studyEnd.message, { ...ctx, path: [...path, "message"] }, "text");
    checkTemplate(studyEnd.redirectUrl, { ...ctx, path: [...path, "redirectUrl"] }, "url");
    if (typeof studyEnd.redirectUrl === "string" && !/^https?:\/\//.test(studyEnd.redirectUrl))
      issue([...path, "redirectUrl"], "The redirect URL must start with https:// (or http://)");
    if (typeof studyEnd.redirectUrl === "string" && typeof studyEnd.redirectSetting === "string")
      issue([...path, "redirectSetting"], "Give a redirect URL or a deployment setting, not both");
  }

  // A computed value linked to a column selects units in the loops after it only
  const shares = loopShareColumns(items);
  const linked: { name: string; column: string }[] = [];
  forEachQuestion(items, [], (q) => {
    const v = q.variable as { type?: unknown; units?: unknown } | undefined;
    if (q.type === "computed" && v?.type === "random" && typeof v.units === "string" && q.name)
      linked.push({ name: q.name, column: v.units });
  });
  const loopPaths = new Map<string, Path>();
  const findLoops = (list: unknown, path: Path) =>
    (Array.isArray(list) ? list : []).forEach((raw, i) => {
      const it = raw as RawItem | null;
      if (it?.type === "unit_loop") loopPaths.set(String(loopPaths.size + 1), [...path, i]);
      else if (it?.type === "show_if") findLoops(it.children, [...path, i, "children"]);
    });
  findLoops(items, []);
  for (const [key, columns] of shares) {
    for (const condition of linked) {
      if (columns.some((c) => c.name === condition.name)) continue;
      issue(
        [...(loopPaths.get(key) ?? []), "units"],
        `${loopTitles.get(key)} comes before computed item '${condition.name}': its units aren't selected by its column '${condition.column}'`,
        true,
      );
    }
  }
  return issues;
}

const ORDER_METHODS: ReadonlySet<string> = new Set(["gt", "gte", "lt", "lte", "between"]);

/**
 * What is wrong with the arguments of a helper call on this question (whose
 * method fits it): their number, and that they are its values (numeric: in
 * its range). Used by validation and the condition editor's rules.
 */
export function callArgumentProblems(
  variable: AnyVariableType,
  call: Pick<SimpleCall, "question" | "item" | "method" | "args">,
): string[] {
  const subject = call.item ? `"${call.question} › ${call.item}"` : `"${call.question}"`;
  const arity: Record<string, [number, number]> = {
    count: [0, 0],
    between: [2, 2],
    isAny: [1, Infinity],
    hasAny: [1, Infinity],
    hasAll: [1, Infinity],
  };
  const [min, max] = arity[call.method] ?? [1, 1];
  if (call.args.length < min || call.args.length > max) {
    if (max === 0) return [`"${METHOD_TEXT[call.method]}" takes no values`];
    const n = min === max ? `${min}` : `at least ${min}`;
    return [`"${METHOD_TEXT[call.method]}" needs ${n} value${max > 1 && min > 1 ? "s" : ""}`];
  }
  if (variable.type === "numeric") {
    const range =
      variable.min !== undefined && variable.max !== undefined ? ` (${variable.min} to ${variable.max})` : "";
    return call.args.flatMap((arg) => {
      if (typeof arg !== "number") return [`${JSON.stringify(arg)} is not a number, and ${subject} is numeric`];
      if ((variable.min !== undefined && arg < variable.min) || (variable.max !== undefined && arg > variable.max)) {
        return [`${arg} is outside the range of ${subject}${range}`];
      }
      return [];
    });
  }
  const values = questionValues(variable);
  if (!values) return [];
  return (
    call.args
      // `is(2)` matches the value "2"; order methods compare numbers only
      .filter((arg) => !values.some((v) => (ORDER_METHODS.has(call.method) ? v === arg : sameValue(v, arg))))
      .map(
        (arg) =>
          `${JSON.stringify(arg)} is not an answer option of ${subject} (${values.map((v) => JSON.stringify(v)).join(", ")})`,
      )
  );
}

/** Validation errors only (warnings left out): what blocks saving a design. */
export function designErrors(items: unknown[]): DesignIssue[] {
  return validateDesignItems(items).filter((i) => !i.warning);
}

/** Every question in the tree (name -> type), and the key of the loop it is in (`unitLoops`; null: coder-level). */
export function collectQuestions(items: unknown): {
  questions: Map<string, AnyVariableType>;
  loopOf: Map<string, string | null>;
} {
  const questions = new Map<string, AnyVariableType>();
  const loopOf = new Map<string, string | null>();
  let loops = 0;
  const walk = (list: unknown, loop: string | null) => {
    if (!Array.isArray(list)) return;
    for (const raw of list) {
      const item = raw as RawItem | null;
      if (!item || typeof item !== "object") continue;
      if (item.type === "unit_loop") walk(item.children, String(++loops));
      else if (item.type === "show_if") walk(item.children, loop);
      else if (item.name && "variable" in item && item.variable && !questions.has(item.name)) {
        questions.set(item.name, item.variable as AnyVariableType);
        loopOf.set(item.name, loop);
      }
    }
  };
  walk(items, null);
  return { questions, loopOf };
}

/**
 * The questions a reference may use at an item, by the same rules as
 * validation: coder-level questions before it, and in a loop the loop's
 * earlier questions. `at` is the item's path (as in validation issues); for
 * a condition this excludes its own children, for a unit loop (its branches
 * and layout) its questions. Used by the admin editor's reference picker.
 */
export function availableQuestions(items: unknown[], at: Path): { name: string; variable: AnyVariableType }[] {
  const result: { name: string; variable: AnyVariableType }[] = [];
  const target = JSON.stringify(at);
  let found = false;
  const walk = (list: unknown, path: Path): void => {
    if (!Array.isArray(list)) return;
    for (let i = 0; i < list.length && !found; i++) {
      const item = list[i] as RawItem | null;
      const itemPath = [...path, i];
      if (JSON.stringify(itemPath) === target) {
        found = true;
        return;
      }
      if (!item || typeof item !== "object") continue;
      if (item.type === "unit_loop") {
        const before = result.length;
        walk(item.children, [...itemPath, "children"]);
        if (found) return;
        result.splice(before);
      } else if (item.type === "show_if") {
        walk(item.children, [...itemPath, "children"]);
      } else if (item.name && "variable" in item && item.variable) {
        result.push({ name: item.name, variable: item.variable as AnyVariableType });
      }
    }
  };
  walk(items, []);
  return result;
}

function questionNames(list: unknown, into = new Set<string>()): Set<string> {
  forEachQuestion(list, [], (q) => q.name && into.add(q.name));
  return into;
}

function forEachQuestion(
  list: unknown,
  path: Path,
  visit: (item: RawItem & { variable?: unknown }, path: Path) => void,
) {
  if (!Array.isArray(list)) return;
  list.forEach((raw, i) => {
    const child = raw as RawItem | null;
    if (!child || typeof child !== "object") return;
    if (child.type === "show_if")
      forEachQuestion((child as { children?: unknown }).children, [...path, i, "children"], visit);
    else if (child.type !== "unit_loop") visit(child as RawItem & { variable?: unknown }, [...path, i]);
  });
}

/** The typed blocks of a template (`::: text|markdown|html|image`), anywhere in it. */
function displayBlocks(source: string): DisplayNode[] {
  const found: DisplayNode[] = [];
  const walk = (nodes: TemplateNode[]) => {
    for (const node of nodes) {
      if (node.type === "if") node.branches.forEach((b) => walk(b.body));
      else if (node.type === "from") node.stages.forEach((st) => walk(st.body));
      else if (node.type === "style") walk(node.body);
      else if (node.type === "display") found.push(node);
    }
  };
  walk(parseTemplateBlocks(source).nodes);
  return found;
}
