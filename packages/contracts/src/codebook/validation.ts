import { TopLevelItemSchema, loopTitle, unitLoops, type CodebookItem } from "./item.js";
import type { AnyVariableType } from "./variableTypes.js";
import { parseSimpleCondition, simpleConditionCalls, type Condition, type SimpleCall } from "./condition.js";
import { supportsAgreement, unitsetHasReferences, type UnitBranch } from "./unitLoop.js";
import { expandSnippets, usesSnippets } from "./snippets.js";
import { parseTemplateBlocks, templateNames, type DisplayNode, type FromStage, type TemplateNode } from "./templateBlocks.js";
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

export interface CodebookValidationIssue {
  path: (string | number)[];
  message: string;
  /** A warning doesn't block saving. */
  warning?: boolean;
}

type Path = (string | number)[];
/** An item as stored: any field may be missing; conditions have no name. */
type RawItem = Partial<CodebookItem> & { name?: string };

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
  /** Checking a branch `when` or unitset name: only coder-level `$var` refs from before the loop. */
  branch?: boolean;
  /** In a loop's layout: the loop's questions in order (`::: from` stages make the ones before them available). */
  loopOrder?: string[];
}

/**
 * Validates a codebook's items array:
 * 1. Validates each top-level item against the TopLevelItemSchema
 * 2. Enforces unique names across all items in the tree
 * 3. Enforces that span variable references in relations exist in preceding items
 * 4. Enforces structural rules (unit_loop cannot be nested, etc.)
 * 5. Checks every reference (`$var`, `$unit`; snippets put in first) in conditions,
 *    branch `when`, unitset names, the layout template and question texts:
 *    it must exist, be available at that point (asked before, not in
 *    another loop), and fit the question's type. Agreement rules must refer
 *    to questions inside the loop, span columns must be shown as plain text.
 *
 * In simple conditions (condition.ts) the helper arguments are checked too.
 * Script syntax isn't checked here (no JS engine); the admin editor does that.
 */
export function validateCodebookItems(items: unknown[]): CodebookValidationIssue[] {
  return [...schemaIssues(items), ...semanticIssues(items)];
}

/** Zod schema validation of each item. */
function schemaIssues(items: unknown[]): CodebookValidationIssue[] {
  const issues: CodebookValidationIssue[] = [];
  for (let i = 0; i < items.length; i++) {
    const result = TopLevelItemSchema.safeParse(items[i]);
    if (!result.success) {
      for (const err of flattenUnions(result.error.issues)) issues.push({ path: [i, ...err.path], message: err.message });
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
function flattenUnions(issues: readonly RawIssue[], prefix: (string | number)[] = []): { path: (string | number)[]; message: string }[] {
  return issues.flatMap((issue) => {
    const path = [...prefix, ...issue.path.filter((p): p is string | number => typeof p !== "symbol")];
    if (issue.code !== "invalid_union" || !issue.errors?.length) return [{ path, message: issue.message }];
    const matching = issue.errors.filter((branch) => !branch.some((e) => e.path.length === 1 && (e.path[0] === "type" || e.path[0] === "mode")));
    if (matching.length === 0) return [{ path, message: issue.message }];
    const best = matching.reduce((a, b) => (b.length < a.length ? b : a));
    return flattenUnions(best, path);
  });
}
/** What the item schemas can't check: names, structure, references (see validateCodebookItems). */
export function semanticIssues(items: unknown[]): CodebookValidationIssue[] {
  const issues: CodebookValidationIssue[] = [];
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
    // Session values (participant id, required URL parameters) exist everywhere; which ones depends on the invitation.
    if (ref.ns === "session") return referenceShape(questions, ref);
    if (ref.ns !== "var") {
      if (ctx.branch) return issue(ctx.path, `${text}: branches and unitset names can only use coder-level $var references`), null;
      if (ctx.loop === null) return issue(ctx.path, `${text} can only be used inside a unit loop`), null;
      return referenceShape(questions, ref);
    }
    const name = ref.path[0];
    const where = loopOf.get(name);
    if (where === undefined) return issue(ctx.path, `${text}: '${name}' is not a question`), null;
    if (name === ctx.self) return issue(ctx.path, `${text}: a question can't refer to itself`), null;
    if (ctx.inside?.has(name)) return issue(ctx.path, `${text}: '${name}' is inside this condition`), null;
    if (ctx.branch && where !== null) {
      return issue(ctx.path, `${text}: branches and unitset names can only use coder-level questions from before the loop`), null;
    }
    if (where !== null && where !== ctx.loop) return issue(ctx.path, `${text}: '${name}' is a question of another unit loop (${loopTitles.get(where)})`), null;
    if (!ctx.available.has(name)) {
      // In a layout, the loop's own answers exist from their question on: `::: from` says from where.
      const next = ctx.loopOrder?.[ctx.loopOrder.indexOf(name) + 1];
      if (ctx.loopOrder?.includes(name)) {
        return issue(ctx.path, `${text}: '${name}' is answered in this loop; use it inside ${next ? `::: from ${next}` : "a ::: from block of a later question"}`), null;
      }
      return issue(ctx.path, `${text}: '${name}' is asked after this point`), null;
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
    if (usesSnippets(condition.script ?? "")) issue(path, "Snippets ([[name]]) can only be used in a unit loop's layout and its questions' texts; in a layout, `::: if [[name]]` works");
    checkScript(condition.script ?? "", { ...ctx, path });
    const simple = parseSimpleCondition(condition.script ?? "");
    if (simple) for (const call of simpleConditionCalls(simple)) checkCall(call, { ...ctx, path });
  }

  /**
   * Checks a template's blocks (their structure and conditions; `from`
   * stages only in a layout). Returns the context at a place in it: inside
   * `from` stages, the loop's questions before theirs are available too.
   */
  function checkBlocks(source: string, ctx: RefContext, kind: "layout" | "text" | "unitset" | "url"): (at: number) => RefContext {
    // Blocks: their conditions, and `from` stages, which make the loop's
    // questions before their question available inside them.
    const blocks = parseTemplateBlocks(source);
    refErrors(blocks.errors, ctx.path);
    if (blocks.hasBlocks && (kind === "unitset" || kind === "url")) issue(ctx.path, "Blocks (:::) can't be used here");
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
      else if (!ctx.loopOrder?.includes(stage.question)) issue(ctx.path, `::: from ${stage.question}: '${stage.question}' is not a question of this loop`);
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
    kind: "layout" | "text" | "unitset" | "url",
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
      if (kind === "unitset" || kind === "url") {
        const what = kind === "url" ? "Redirect URLs" : "Unitset names";
        if (!segment.ref) issue(here.path, `${what} can only use ${kind === "url" ? "$var and $session" : "$var"} references, not {{ }}`);
        else if (segment.ref.suffix) issue(here.path, `${what} can't use ::${segment.ref.suffix}`);
      } else {
        refErrors(extractReferences(segment.script).errors, here.path);
        // `{{ $unit.text::markdown }}`: the suffix goes after the braces.
        const inside = /::(text|markdown|image|html)\b/.exec(segment.script);
        if (!segment.ref && inside) issue(here.path, `A suffix goes after the }}: {{ ... }}::${inside[1]}`);
        const display = displays.find((d) => segment.start >= d.bodyStart && segment.start < d.bodyEnd);
        if (display && segment.suffix !== "text") {
          issue(here.path, `Inside a ::: ${display.kind} block values are put in as they are: leave out ::${segment.suffix}`);
        }
      }
      for (const ref of segment.references) {
        const shape = checkRef(ref, here);
        if (kind === "unitset" && shape?.ok && shape.array) issue(here.path, `${referenceText(ref)} holds a list; a unitset name needs a single value`);
        if (kind === "url" && ref.ns === "unit") issue(here.path, `${referenceText(ref)}: redirect URLs can only use $var and $session references`);
      }
    }
    const named = displays.flatMap((d) => (d.name ? [d.name] : []));
    for (const name of new Set(named.filter((n, i) => named.indexOf(n) !== i))) {
      issue(ctx.path, `Two blocks are named '${name}': names must be unique`);
    }
    const names = templateNames(source);
    return { shown: new Set(names.shown), selectable: new Set(names.selectable) };
  }

  function checkLoop(item: RawItem, itemPath: Path, loopName: string) {
    const loop = item as { units?: UnitBranch[]; children?: unknown; layout?: { template?: unknown; snippets?: Record<string, string> } };
    const loopQuestions = questionNames(loop.children);
    const branchCtx = (path: Path): RefContext => ({ path, loop: null, available: coderAvailable, branch: true });
    (Array.isArray(loop.units) ? loop.units : []).forEach((raw, b) => {
      const branch = raw as Partial<UnitBranch> & { unitset?: unknown; unitsets?: unknown; until?: { on?: unknown } };
      const path = [...itemPath, "units", b];
      checkCondition(branch?.when, branchCtx([...path, "when"]));
      if (branch?.mode === "all" || branch?.mode === "shared") checkTemplate(branch.unitset, branchCtx([...path, "unitset"]), "unitset");
      if (branch?.overlap) checkTemplate(branch.overlap.unitset, branchCtx([...path, "overlap", "unitset"]), "unitset");
      if (branch?.mode === "sets" && Array.isArray(branch.unitsets)) {
        branch.unitsets.forEach((name, i) => {
          if (typeof name === "string" && unitsetHasReferences(name)) {
            issue([...path, "unitsets", i], `"${name}": the sets to choose from are plain unitset names, without $var references`);
          }
        });
      }
      const agreement = branch?.mode === "shared" ? branch.until?.on : undefined;
      if (typeof agreement === "string") {
        const at = [...path, "until", "on"];
        if (!loopQuestions.has(agreement)) issue(at, `Agreement question '${agreement}' is not a question in this loop`);
        else if (!supportsAgreement(questions.get(agreement)!)) {
          issue(
            at,
            `Agreement needs a question with one categorical answer (nominal without multiple answers, ordinal or swipe); "${agreement}" is ${describeQuestion(questions.get(agreement)!)}`,
          );
        }
      }
    });

    const snippets = loop.layout?.snippets ?? {};
    const names = checkTemplate(
      loop.layout?.template,
      { path: [...itemPath, "layout", "template"], loop: loopName, available: coderAvailable, snippets, loopOrder: [...loopQuestions] },
      "layout",
    );
    const idHint = (id: string) => (id.startsWith("unit.") ? ` (as $${id})` : id.startsWith("var.") ? "" : ` (as a ::: block named '${id}')`);
    forEachQuestion(loop.children, [...itemPath, "children"], (q, path) => {
      const variable = q.variable as { type?: string; fields?: unknown; focus?: unknown } | undefined;
      for (const id of Array.isArray(variable?.focus) ? variable.focus : []) {
        if (typeof id === "string" && !names.shown.has(id)) issue([...path, "variable", "focus"], `'${id}' is not shown in the layout${idHint(id)}`);
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

  function walk(itemList: unknown[], currentPath: Path, loop: { name: string; snippets: Record<string, string> } | null) {
    if (!Array.isArray(itemList)) return;

    itemList.forEach((rawItem, index) => {
      if (!rawItem || typeof rawItem !== "object") return;
      const item = rawItem as RawItem;
      const itemPath = [...currentPath, index];
      const isQuestion = item.type === "question";
      const available = loop ? new Set([...coderAvailable, ...loopAvailable]) : coderAvailable;

      // Check name validity and uniqueness (conditions have no name)
      if (item.type === "condition" || item.type === "unit_loop") {
        // Nothing refers to them by name (a loop is identified by its position).
      } else if (!item.name || item.name.trim() === "") {
        issue([...itemPath, "name"], "Item name cannot be empty");
      } else {
        if (!/^[a-zA-Z0-9_]+$/.test(item.name)) {
          issue([...itemPath, "name"], `Name '${item.name}' contains invalid characters (letters, numbers and _ only)`);
        }
        if (seenNames.has(item.name)) issue([...itemPath, "name"], `Duplicate name '${item.name}'`);
        else seenNames.set(item.name, itemPath);
      }

      if (isQuestion) {
        const variable = item.variable as { type?: string; question?: unknown; instruction?: unknown; from?: { variable?: string }; to?: { variable?: string } } | undefined;
        // Check relation variable references
        if (variable?.type === "relation") {
          for (const end of ["from", "to"] as const) {
            const ref = variable[end]?.variable;
            if (ref && !spanVariables.has(ref)) {
              issue([...itemPath, "variable", end, "variable"], `Relation '${end}' refers to '${ref}' which is not a preceding span variable`);
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
            { path: [...itemPath, "variable", field], loop: loop?.name ?? null, available, snippets: loop?.snippets, self: item.name },
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
      } else if (item.type === "condition") {
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
      } else if (item.type === "question") {
        if (!loop && (item.variable?.type === "span" || item.variable?.type === "relation")) {
          issue([...itemPath, "variable", "type"], `Question '${item.name}' with answer type '${item.variable.type}' can only be used inside a unit_loop`);
        } else if (loop && item.variable?.type === "auto") {
          issue([...itemPath, "variable", "type"], `Question '${item.name}' with answer type 'auto' can only be used outside a unit_loop`);
        }
      }
    });
  }

  walk(items, [], null);
  return issues;
}

/**
 * What is wrong with the arguments of a helper call on this question (whose
 * method fits it): their number, and that they are its values (numeric: in
 * its range). Used by validation and the condition editor's rules.
 */
export function callArgumentProblems(variable: AnyVariableType, call: Pick<SimpleCall, "question" | "item" | "method" | "args">): string[] {
  const subject = call.item ? `"${call.question} › ${call.item}"` : `"${call.question}"`;
  const arity: Record<string, [number, number]> = { count: [0, 0], between: [2, 2], isAny: [1, Infinity], hasAny: [1, Infinity], hasAll: [1, Infinity] };
  const [min, max] = arity[call.method] ?? [1, 1];
  if (call.args.length < min || call.args.length > max) {
    if (max === 0) return [`"${METHOD_TEXT[call.method]}" takes no values`];
    const n = min === max ? `${min}` : `at least ${min}`;
    return [`"${METHOD_TEXT[call.method]}" needs ${n} value${max > 1 && min > 1 ? "s" : ""}`];
  }
  if (variable.type === "numeric") {
    const range = variable.min !== undefined && variable.max !== undefined ? ` (${variable.min} to ${variable.max})` : "";
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
  return call.args
    .filter((arg) => !values.includes(arg))
    .map((arg) => `${JSON.stringify(arg)} is not an answer option of ${subject} (${values.map((v) => JSON.stringify(v)).join(", ")})`);
}

/** Validation errors only (warnings left out): what blocks saving a codebook. */
export function codebookErrors(items: unknown[]): CodebookValidationIssue[] {
  return validateCodebookItems(items).filter((i) => !i.warning);
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
      else if (item.type === "condition") walk(item.children, loop);
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
      } else if (item.type === "condition") {
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

function forEachQuestion(list: unknown, path: Path, visit: (item: RawItem & { variable?: unknown }, path: Path) => void) {
  if (!Array.isArray(list)) return;
  list.forEach((raw, i) => {
    const child = raw as RawItem | null;
    if (!child || typeof child !== "object") return;
    if (child.type === "condition") forEachQuestion((child as { children?: unknown }).children, [...path, i, "children"], visit);
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
