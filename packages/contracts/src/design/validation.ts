import { TopLevelItemSchema, loopTitle, unitLoops, type DesignItem, type LayoutItem } from "./item.js";
import { layoutsByItem, loopSnippets } from "./layoutItems.js";
import type { AnyVariableType } from "./variableTypes.js";
import { sameValue } from "./options.js";
import { optionsSource } from "./optionsFrom.js";
import { parseSimpleCondition, simpleConditionCalls, type Condition, type SimpleCall } from "./condition.js";
import { CHECKABLE_TYPES, supportsAgreement, type LoopUnits } from "./unitLoop.js";
import {
  RESERVED_SESSION_NAMES,
  STUDY_END_NAME,
  inviteOf,
  sessionItem,
  sessionNames,
  type SessionItem,
  type UrlParam,
} from "./session.js";
import { loopShareColumns, selectsUnits } from "./assignment.js";
import { CONDITION_SET } from "../sets.js";
import { forEachItem } from "./walk.js";
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
  specialKinds,
  extractReferences,
  parseTemplate,
  referenceShape,
  referenceText,
  type Reference,
  type ReferenceError,
  type ReferenceShape,
} from "./references.js";
import { nameError, own } from "../common.js";

export interface DesignIssue {
  path: (string | number)[];
  message: string;
  /** A warning doesn't block saving. */
  warning?: boolean;
}

type Path = (string | number)[];
/** An item as stored: any field may be missing; conditions have no name. */
type RawItem = Partial<DesignItem> & { name?: string };

/** The unit loop around a point of the walk: its key, the snippets texts may use, the layouts that apply where. */
interface LoopContext {
  name: string;
  snippets: Record<string, string>;
  /** Its questions in order (for `::: from` in layouts). */
  order: string[];
  /** The layouts that may apply to each named item (layoutItems.ts). */
  candidates: Map<string, (LayoutItem | null)[]>;
  /** What each layout item shows, once checked (it comes before the questions it applies to). */
  layoutNames: Map<object, { shown: Set<string>; selectable: Set<string> }>;
}
/** The texts of an end (an end item, or the Study entry's `end`), as stored. */
type EndTexts = { message?: unknown; redirectUrl?: unknown; redirectSetting?: unknown };

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
/** One end of a relation rule, as validation reads it (unparsed). */
type RuleEnd = { variable?: string; values?: string[] };

/** What the item schemas can't check: names, structure, references (see validateDesignItems). */
export function semanticIssues(items: unknown[]): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const { questions, loopOf } = collectQuestions(items);
  /** Loop key -> how messages call it. */
  const loopTitles = new Map(unitLoops(items).map(({ key, loop }) => [key, loopTitle(loop, key)]));
  let loopCount = 0;
  const seenNames = new Map<string, Path>();
  /** Span questions seen so far: name -> their loop and option values (what relation rules can name). */
  const spanVariables = new Map<string, { loop: string | null; values: Set<string> }>();
  /** Coder-level questions seen so far. */
  const coderAvailable = new Set<string>();
  /** Questions of the current loop seen so far. */
  let loopAvailable = new Set<string>();
  /** `$session` names (declared URL parameters and the built-in ones). */
  const sessionNamed = new Set(sessionNames(items));
  /** The experiment that selects units (`condition_set`), once found. */
  let unitsExperiment: string | null = null;

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
    // Session values exist everywhere: the Study entry's URL parameters and the built-in ones.
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

  /**
   * An end's message and redirect (an end item's, or the study's normal
   * end). They are shown outside the loop's layout: no snippets.
   */
  function checkEndTexts(end: EndTexts, path: Path, loop: string | null, available: ReadonlySet<string>) {
    const ctx = { loop, available, snippets: undefined };
    checkTemplate(end.message, { ...ctx, path: [...path, "message"] }, "text");
    checkTemplate(end.redirectUrl, { ...ctx, path: [...path, "redirectUrl"] }, "url");
    if (typeof end.redirectUrl === "string" && !/^https?:\/\//.test(end.redirectUrl))
      issue([...path, "redirectUrl"], "The redirect URL must start with https:// (or http://)");
    if (typeof end.redirectUrl === "string" && typeof end.redirectSetting === "string")
      issue([...path, "redirectSetting"], "Give a redirect URL or a deployment setting, not both");
  }

  /** End items anywhere in the design: name -> outcome. */
  const endItems = new Map<string, unknown>();
  forEachItem<{ type?: unknown; name?: unknown; outcome?: unknown }>(items, (it) => {
    if (it.type === "end" && typeof it.name === "string") endItems.set(it.name, it.outcome);
  });

  /**
   * A loop's practice and gold checks: questions of this loop with answers
   * compared by value, whose answer columns coders never see; a gold
   * screen-out at an end item.
   */
  function checkUnitChecks(
    loop: { units?: Partial<LoopUnits> | null; children?: unknown; layout?: unknown },
    itemPath: Path,
    loopQuestions: ReadonlySet<string>,
  ) {
    const units = loop.units && typeof loop.units === "object" ? loop.units : null;
    const path = [...itemPath, "units"];
    const checks = { practice: units?.practiceCheck, gold: units?.goldCheck };
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

  /**
   * A loop's units against the who codes: dividing only for a crowd, its agreement
   * question one of this loop's with one categorical answer; an earlier
   * previous loop's units only with a previous loop, and then not divided again.
   */
  function checkLoopUnits(
    raw: Partial<LoopUnits> | null | undefined,
    path: Path,
    loopName: string,
    loopQuestions: ReadonlySet<string>,
  ) {
    const units = raw && typeof raw === "object" ? raw : null;
    if (!units) return;
    const invite = sessionItem(items)?.invite;
    if (units.divide && invite?.mode !== "crowd")
      issue(
        [...path, "divide"],
        "Dividing units among coders is for a crowd: expert coders get the units of their set (Who codes)",
      );
    if (units.sameAsPrevious) {
      if (Number(loopName) <= 1) issue([...path, "sameAsPrevious"], "There is no previous loop to take the units of");
      if (units.divide)
        issue([...path, "divide"], "Taking the units of the previous loop, they aren't divided again: remove dividing");
    }
    const agreement = units.divide?.until?.on;
    if (typeof agreement === "string") {
      const at = [...path, "divide", "until", "on"];
      const variable = questions.get(agreement);
      if (!variable || !loopQuestions.has(agreement))
        issue(at, `Agreement question '${agreement}' is not a question in this loop`);
      else if (!supportsAgreement(variable))
        issue(
          at,
          `Agreement needs a question with one categorical answer (nominal without multiple answers, ordinal or swipe); "${agreement}" is ${describeQuestion(variable)}`,
        );
    }
  }

  /** A loop's units settings; what its walk needs to check layouts and the questions after them. */
  function checkLoop(item: RawItem, itemPath: Path, loopName: string): LoopContext {
    const loop = item as { units?: Partial<LoopUnits> | null; children?: unknown };
    const loopQuestions = questionNames(loop.children);
    // The right answers and feedback must never reach coders (they'd be sent with every unit): no text may use them
    const answers = new Set(JSON.stringify(loop.children ?? null).match(/\$unit\.(answer|feedback)_\w+/g) ?? []);
    for (const ref of answers)
      issue(
        itemPath,
        `The answer column ${ref.slice("$unit.".length)} is shown to coders (in the layout, a question or a condition): it must stay hidden`,
      );
    checkUnitChecks(loop, itemPath, loopQuestions);
    checkLoopUnits(loop.units, [...itemPath, "units"], loopName, loopQuestions);
    return {
      name: loopName,
      snippets: loopSnippets(loop.children),
      order: [...loopQuestions],
      candidates: layoutsByItem(loop.children),
      layoutNames: new Map(),
    };
  }

  /** A layout item's template (with its own snippets): what it shows, for the questions after it. */
  function checkLayoutItem(item: RawItem, itemPath: Path, loop: LoopContext) {
    const layout = item as { template?: unknown; snippets?: Record<string, string> };
    if (typeof layout.template !== "string") return;
    loop.layoutNames.set(
      item,
      checkTemplate(
        layout.template,
        {
          path: [...itemPath, "template"],
          loop: loop.name,
          available: coderAvailable,
          snippets: layout.snippets ?? {},
          loopOrder: loop.order,
        },
        "layout",
      ),
    );
  }

  /**
   * A loop question's focus and span fields: shown by each layout that may
   * apply to it (layoutItems.ts), as plain text for span fields.
   */
  function checkShownByLayouts(item: RawItem, itemPath: Path, loop: LoopContext) {
    const variable = (item as { variable?: unknown }).variable as
      { type?: string; fields?: unknown; focus?: unknown } | undefined;
    const focus = (Array.isArray(variable?.focus) ? variable.focus : []).filter(
      (f): f is string => typeof f === "string",
    );
    const fields = (variable?.type === "span" && Array.isArray(variable.fields) ? variable.fields : []).filter(
      (f): f is string => typeof f === "string",
    );
    if (focus.length === 0 && fields.length === 0) return;
    const layouts = (loop.candidates.get(item.name ?? "") ?? []).filter((c) => c !== null);
    if (layouts.length === 0) {
      if (focus.length > 0)
        issue([...itemPath, "variable", "focus"], "No layout comes before this question: there is nothing to focus");
      if (fields.length > 0)
        issue(
          [...itemPath, "variable", "fields"],
          `Span question '${item.name}' selects text in the unit, but no layout comes before it to show the unit`,
        );
      return;
    }
    const idHint = (id: string) =>
      id.startsWith("unit.") ? ` (as $${id})` : id.startsWith("var.") ? "" : ` (as a ::: block named '${id}')`;
    for (const layout of layouts) {
      const names = loop.layoutNames.get(layout);
      if (!names) continue;
      const which = layouts.length > 1 ? ` '${layout.label?.trim() || "Layout"}'` : "";
      for (const id of focus)
        if (!names.shown.has(id))
          issue([...itemPath, "variable", "focus"], `'${id}' is not shown in the layout${which}${idHint(id)}`);
      for (const field of fields) {
        if (names.selectable.has(`unit.${field}`)) continue;
        issue(
          [...itemPath, "variable", "fields"],
          `Span question '${item.name}' selects text in the unit field '${field}', but the layout${which} doesn't show it as plain text ($unit.${field})`,
        );
      }
    }
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
    if (!hasLoop && invite?.mode === "coders")
      issue(
        [...itemPath, "invite"],
        "Expert coders each get their own units, but the design has no unit loop yet: until it has, coders get no units (their links work)",
        true,
      );
  }

  /**
   * An experiment: outside loops; one that selects units (`condition_set`)
   * only with a crowd, and only one; a condition from a URL parameter of the
   * Study entry, whose values are the conditions; stratified on earlier
   * answers or session values.
   */
  function checkExperiment(item: RawItem, itemPath: Path, inLoop: boolean, available: ReadonlySet<string>) {
    const variable = (item as { variable?: unknown }).variable as
      | { type?: unknown; units?: unknown; stratify?: unknown; draw?: unknown; param?: unknown; options?: unknown }
      | undefined;
    if (inLoop) return issue([...itemPath, "type"], `Experiment '${item.name}' can only be used outside a unit loop`);
    if (variable?.type !== "random") return;
    if (selectsUnits(item)) {
      if (sessionNamed.has(item.name) || (RESERVED_SESSION_NAMES as readonly string[]).includes(item.name))
        issue([...itemPath, "name"], `Experiment '${item.name}' selects units: its name can't also be a session value`);
      if (inviteOf(sessionItem(items))?.mode === "coders")
        issue(
          [...itemPath, "variable", "units"],
          `Experiment '${item.name}' selects units by condition, but expert coders get the units of their coder set: invite a crowd`,
        );
      if (unitsExperiment !== null)
        issue(
          [...itemPath, "variable", "units"],
          `Experiment '${unitsExperiment}' already selects units: only one experiment can select units`,
        );
      else unitsExperiment = item.name;
    }
    // A condition from a URL parameter: the parameter's values are the conditions
    if (variable.draw === "url_param" && typeof variable.param === "string") {
      const at = [...itemPath, "variable", "param"];
      const param = (sessionItem(items)?.urlParams ?? []).find((p) => p?.name === variable.param) as
        UrlParam | undefined;
      const options = Array.isArray(variable.options)
        ? (variable.options as { value?: unknown }[]).map((o) => String(o?.value))
        : null;
      if (!param)
        issue(at, `Experiment '${item.name}': no URL parameter '${variable.param}' (declare it in the Study entry)`);
      else if (!param.values)
        issue(
          at,
          `Experiment '${item.name}': list the values of URL parameter '${param.name}' (its values are the conditions)`,
        );
      else if (options) {
        const values = param.values.map((v) => v.value);
        const missing = values.filter((v) => !options.includes(v));
        const unused = options.filter((v) => !values.includes(v));
        if (missing.length > 0 || unused.length > 0)
          issue(
            at,
            `Experiment '${item.name}': the values of URL parameter '${param.name}' must be its conditions` +
              (missing.length > 0 ? ` (not a condition: ${missing.join(", ")})` : "") +
              (unused.length > 0 ? ` (not a value: ${unused.join(", ")})` : ""),
          );
      }
    }
    // Groups for a balanced draw: answers given before it, or session values
    for (const name of Array.isArray(variable.stratify) ? (variable.stratify as string[]) : []) {
      const known = name.startsWith("session.") ? sessionNamed.has(name.slice("session.".length)) : available.has(name);
      if (!known)
        issue(
          [...itemPath, "variable", "stratify"],
          `Experiment '${item.name}': balanced within '${name}', which is not a question before it or a session value (session.<name>)`,
        );
    }
  }

  function walk(itemList: unknown[], currentPath: Path, loop: LoopContext | null) {
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
      // End items go in a branch; a unit loop only at the top level
      if (currentPath.length === 0 && item.type === "end")
        issue([...itemPath, "type"], "An end item goes in a branch (shown only if a condition holds)");
      if (currentPath.length > 0 && item.type === "unit_loop" && !loop)
        issue(
          [...itemPath, "type"],
          "A unit loop goes at the top level, not inside a branch (give the loop a condition instead)",
        );
      if (item.type === "layout") {
        if (loop) checkLayoutItem(item, itemPath, loop);
        else issue([...itemPath, "type"], "A layout shows a unit: it goes in a unit loop");
        return;
      }

      // Check name validity and uniqueness (branches and loops have no name)
      if (item.type === "branch" || item.type === "unit_loop") {
        // Nothing refers to them by name (a loop is identified by its position).
      } else if (!item.name || item.name.trim() === "") {
        issue([...itemPath, "name"], "Item name cannot be empty");
      } else {
        const problem = nameError(item.name);
        if (problem) issue([...itemPath, "name"], `Name '${item.name}': ${problem}`);
        if (item.name === STUDY_END_NAME)
          issue([...itemPath, "name"], `'${STUDY_END_NAME}' is the study's own end: choose another name`);
        if (seenNames.has(item.name)) issue([...itemPath, "name"], `Duplicate name '${item.name}'`);
        else seenNames.set(item.name, itemPath);
      }

      if (item.type === "experiment") {
        checkExperiment(item, itemPath, loop !== null, available);
        if (item.name && !loop) coderAvailable.add(item.name);
      }

      if (isQuestion) {
        const variable = item.variable as
          | {
              type?: string;
              question?: unknown;
              options?: { value?: unknown }[];
              rules?: { from?: RuleEnd; to?: RuleEnd; options?: unknown[] }[];
            }
          | undefined;
        // Options from data: a unit's list (in a loop), or an earlier span question of the loop
        const from = (variable as { optionsFrom?: { from?: unknown } } | undefined)?.optionsFrom?.from;
        if (typeof from === "string" && /^\$(unit|var)\./.test(from)) {
          const { ns, name } = optionsSource(from);
          const path = [...itemPath, "variable", "optionsFrom", "from"];
          if (ns === "unit" && !loop) issue(path, `${from}: options from a unit are for questions in a unit loop`);
          if (ns === "var") {
            const span = spanVariables.get(name);
            if (!span || span.loop !== (loop?.name ?? null))
              issue(path, `${from}: options come from a span question before this one in the same unit loop`);
          }
        }
        if (variable?.type === "relation" && Array.isArray(variable.rules)) {
          const types = new Set((variable.options ?? []).map((o) => o?.value));
          variable.rules.forEach((rule, r) => {
            for (const end of ["from", "to"] as const) {
              const ref = rule?.[end]?.variable;
              const path = [...itemPath, "variable", "rules", r, end];
              if (!ref) continue;
              const span = spanVariables.get(ref);
              if (!span || span.loop !== (loop?.name ?? null)) {
                issue(
                  [...path, "variable"],
                  `A relation rule refers to '${ref}', which is not a span question before it in this loop`,
                );
                continue;
              }
              for (const value of rule[end]?.values ?? [])
                if (!span.values.has(value)) issue([...path, "values"], `'${ref}' has no label '${value}'`);
            }
            for (const type of rule?.options ?? [])
              if (!types.has(type))
                issue(
                  [...itemPath, "variable", "rules", r, "options"],
                  `This relation question has no type '${String(type)}'`,
                );
          });
        }
        if (variable?.type === "span" && item.name)
          spanVariables.set(item.name, {
            loop: loop?.name ?? null,
            values: new Set((variable.options ?? []).flatMap((o) => (typeof o?.value === "string" ? [o.value] : []))),
          });
        if (!loop && (item.variable as { focus?: unknown } | undefined)?.focus !== undefined) {
          issue([...itemPath, "variable", "focus"], "Focus only works for questions in a unit loop");
        }
        if (loop) checkShownByLayouts(item, itemPath, loop);

        const texts = [
          { text: variable?.question, path: [...itemPath, "variable", "question"] },
          { text: (item as { instruction?: unknown }).instruction, path: [...itemPath, "instruction"] },
        ];
        for (const { text, path } of texts) {
          checkTemplate(
            text,
            {
              path,
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
        const context = checkLoop(item, itemPath, key);
        // Whether coders get the loop: decided before it, on coder-level answers
        checkCondition((item as { condition?: Condition }).condition, {
          path: [...itemPath, "condition"],
          loop: null,
          available: coderAvailable,
        });
        if (!item.children || item.children.length === 0) {
          issue([...itemPath, "children"], "A unit loop must have at least one item");
        } else if (!loop) {
          loopAvailable = new Set();
          walk(item.children, [...itemPath, "children"], context);
          loopAvailable = new Set();
        }
      } else if (item.type === "branch") {
        checkCondition(item.condition, {
          path: [...itemPath, "condition"],
          loop: loop?.name ?? null,
          available,
          snippets: loop?.snippets,
          inside: questionNames(item.children),
        });
        if (!item.children || item.children.length === 0) {
          issue([...itemPath, "children"], "A branch must have at least one item");
        } else {
          walk(item.children, [...itemPath, "children"], loop);
        }
        // Else items: shown when the condition doesn't hold
        const otherwise = (item as { elseChildren?: unknown }).elseChildren;
        if (Array.isArray(otherwise)) walk(otherwise, [...itemPath, "elseChildren"], loop);
      } else if (item.type === "end") {
        checkEndTexts(item as EndTexts, itemPath, loop?.name ?? null, available);
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
  const studyEnd = studyIndex >= 0 ? (items[studyIndex] as { end?: EndTexts }).end : undefined;
  if (studyEnd) checkEndTexts(studyEnd, [studyIndex, "end"], null, coderAvailable);

  // An experiment that selects units does so in the loops after it only
  const shares = loopShareColumns(items);
  const linked: { name: string }[] = [];
  forEachItem<RawItem>(items, (it) => {
    if (selectsUnits(it)) linked.push({ name: it.name });
    if (it.type !== "branch") return "skip";
  });
  const loopPaths = new Map<string, Path>();
  forEachItem<RawItem>(items, (it, path) => {
    if (it.type === "unit_loop") loopPaths.set(String(loopPaths.size + 1), path);
    if (it.type !== "branch") return "skip";
  });
  for (const [key, columns] of shares) {
    for (const condition of linked) {
      if (columns.some((c) => c.name === condition.name)) continue;
      issue(
        [...(loopPaths.get(key) ?? []), "units"],
        `${loopTitles.get(key)} comes before experiment '${condition.name}': its units aren't selected by ${CONDITION_SET}`,
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
  const [min, max] = own(arity, call.method) ?? [1, 1];
  if (call.args.length < min || call.args.length > max) {
    if (max === 0) return [`"${METHOD_TEXT[call.method]}" takes no values`];
    const n = min === max ? `${min}` : `at least ${min}`;
    return [`"${METHOD_TEXT[call.method]}" needs ${n} value${max > 1 && min > 1 ? "s" : ""}`];
  }
  // A special answer's kind is a value too: `.is("dont_know")`
  const specials = specialKinds(variable);
  const isSpecial = (arg: unknown) => !ORDER_METHODS.has(call.method) && specials.includes(arg as never);
  // Options from data are each unit's: values can't be checked here
  if (variable.type === "nominal" && variable.optionsFrom) return [];
  if (variable.type === "numeric") {
    const range =
      variable.min !== undefined && variable.max !== undefined ? ` (${variable.min} to ${variable.max})` : "";
    return call.args.flatMap((arg) => {
      if (isSpecial(arg)) return [];
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
      .filter((arg) => !isSpecial(arg))
      .filter((arg) => !values.some((v) => (ORDER_METHODS.has(call.method) ? v === arg : sameValue(v, arg))))
      .map(
        (arg) =>
          `${JSON.stringify(arg)} is not an answer option of ${subject} (${[...values, ...specials].map((v) => JSON.stringify(v)).join(", ")})`,
      )
  );
}

/** Validation errors only (warnings left out): what blocks saving a design. */
export function designErrors(items: unknown[]): DesignIssue[] {
  return validateDesignItems(items).filter((i) => !i.warning);
}

/** What deploying asks of a design (contracts `NO_INVITE`): no errors, and who codes chosen. */
export const NO_INVITE = "Choose who codes first: expert coders or a crowd (one link)";

/** The errors that keep a design from being deployed: `designErrors`, and who codes not chosen. */
export function deployErrors(items: unknown[]): DesignIssue[] {
  if (inviteOf(sessionItem(items)) !== null) return designErrors(items);
  const at = items.findIndex((i) => (i as { type?: unknown } | null)?.type === "session");
  return [...designErrors(items), { path: at >= 0 ? [at, "invite"] : [], message: NO_INVITE }];
}

/** Every question in the tree (name -> type), and the key of the loop it is in (`unitLoops`; null: coder-level). */
export function collectQuestions(items: unknown): {
  questions: Map<string, AnyVariableType>;
  loopOf: Map<string, string | null>;
} {
  const questions = new Map<string, AnyVariableType>();
  const loopOf = new Map<string, string | null>();
  let loops = 0;
  const walk = (list: unknown, loop: string | null) =>
    forEachItem<RawItem>(list, (item) => {
      if (item.type === "branch") return;
      if (item.type === "unit_loop") walk(item.children, String(++loops));
      else if (item.name && "variable" in item && item.variable && !questions.has(item.name)) {
        questions.set(item.name, item.variable as AnyVariableType);
        loopOf.set(item.name, loop);
      }
      return "skip";
    });
  walk(items, null);
  return { questions, loopOf };
}

/**
 * The questions a reference may use at an item, by the same rules as
 * validation: coder-level questions before it, and in a loop the loop's
 * earlier questions. `at` is the item's path (as in validation issues); for
 * a branch (its condition) this excludes its own children, for a unit loop (its units
 * settings and layout) its questions. Used by the admin editor's reference picker.
 */
export function availableQuestions(items: unknown[], at: Path): { name: string; variable: AnyVariableType }[] {
  const result: { name: string; variable: AnyVariableType }[] = [];
  const target = JSON.stringify(at);
  let found = false;
  // Not forEachItem: it stops at the target (which may be a null item) and drops a passed loop's questions
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
      } else if (item.type === "branch") {
        walk(item.children, [...itemPath, "children"]);
        walk((item as { elseChildren?: unknown }).elseChildren, [...itemPath, "elseChildren"]);
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

/** Visits every item of a list, also inside branches but not inside unit loops (questions, experiments and end items). */
function forEachQuestion(
  list: unknown,
  path: Path,
  visit: (item: RawItem & { variable?: unknown }, path: Path) => void,
) {
  forEachItem<RawItem & { variable?: unknown }>(
    list,
    (child, at) => {
      if (child.type === "branch") return;
      if (child.type !== "unit_loop" && child.type !== "layout") visit(child, at);
      return "skip";
    },
    path,
  );
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
