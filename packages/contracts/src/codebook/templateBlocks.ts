import { extractReferences, parseTemplate, referenceText, templateFences, templateReferences, type TemplateExpression, type Reference, type ReferenceError, type TemplateFence } from "./references.js";

// Blocks in a template (docs/client.md §3, "Blocks"): fenced lines, as
// Pandoc's fenced divs, that show part of a template only if a condition
// holds, from a question of the loop on, with a style, or as one kind
// (`::: text|markdown|html|image [name]`, see DisplayNode):
//
//   ::: if $var.group.is('experiment')      ::: from topics
//   ...                                      ...
//   ::: else if <script>                     ::: from relevance
//   ...                                      ...
//   ::: else                                 :::
//   ...
//   :::                                      ::: style color: darkred; font-size: 120%
//                                            ...
//                                            :::
//
// A bare fence closes the innermost block; it must have as many colons as
// the block's opening fence (use more colons on outer blocks to tell them
// apart). `else if`/`else` continue an `if`, and a `from` right after
// another `from` (same colons) continues it: the last stage whose question
// is reached shows. Fence lines are not part of the text.

export interface IfBranch {
  /** The condition script (null for `else`). */
  script: string | null;
  references: Reference[];
  /** The fence line. */
  start: number;
  body: TemplateNode[];
  bodyStart: number;
  bodyEnd: number;
}

export interface FromStage {
  question: string;
  start: number;
  body: TemplateNode[];
  bodyStart: number;
  bodyEnd: number;
}

/** How a typed block (`::: text|markdown|html|image [name]`) shows its content. */
export type DisplayKind = "text" | "markdown" | "html" | "image";
export const DISPLAY_KINDS: readonly DisplayKind[] = ["text", "markdown", "html", "image"];

/**
 * A typed block: its content, with values put in as they are, shown as one
 * kind; with a name, the element is marked with it (`data-field`), so a
 * question can point at it and (`text`) a span question can select in it.
 * A value's suffix (`$unit.x::markdown`) is the short form of one around it.
 */
export interface DisplayNode {
  type: "display";
  kind: DisplayKind;
  name?: string;
  start: number;
  body: TemplateNode[];
  bodyStart: number;
  bodyEnd: number;
}

export type TemplateNode =
  | { type: "text"; start: number; end: number }
  | DisplayNode
  | { type: "if"; branches: IfBranch[]; start: number }
  | { type: "from"; stages: FromStage[]; start: number }
  | { type: "style"; css: string; style: Record<string, string>; start: number; body: TemplateNode[]; bodyStart: number; bodyEnd: number };

export interface ParsedBlocks {
  nodes: TemplateNode[];
  errors: ReferenceError[];
  /** Whether the template has blocks at all. */
  hasBlocks: boolean;
}

type Open =
  | { kind: "display"; node: DisplayNode; colons: number }
  | { kind: "if"; node: Extract<TemplateNode, { type: "if" }>; colons: number }
  | { kind: "from"; node: Extract<TemplateNode, { type: "from" }>; colons: number }
  | { kind: "style"; node: Extract<TemplateNode, { type: "style" }>; colons: number };

/** The body nodes are collected in, and the range it covers, of an open block. */
function currentBody(open: Open): { body: TemplateNode[]; set: (end: number) => void } {
  if (open.kind === "style" || open.kind === "display") return { body: open.node.body, set: (end) => (open.node.bodyEnd = end) };
  const parts = open.kind === "if" ? open.node.branches : open.node.stages;
  const last = parts[parts.length - 1];
  return { body: last.body, set: (end) => (last.bodyEnd = end) };
}

/** Parses a template's blocks into a tree whose text nodes are ranges of the source (with `$` values, see parseTemplate). */
export function parseTemplateBlocks(source: string): ParsedBlocks {
  const fences = templateFences(source);
  const root: TemplateNode[] = [];
  const errors: ReferenceError[] = [];
  const stack: Open[] = [];
  let pos = 0;

  const body = () => (stack.length ? currentBody(stack[stack.length - 1]).body : root);
  const closeBodyAt = (end: number) => {
    if (stack.length) currentBody(stack[stack.length - 1]).set(end);
  };
  const error = (fence: TemplateFence, message: string) => errors.push({ message, start: fence.start, end: fence.end });
  const script = (fence: TemplateFence) => {
    const extracted = extractReferences(fence.arg, fence.argStart);
    errors.push(...extracted.errors);
    return extracted.references;
  };

  for (const fence of fences) {
    if (fence.start > pos) body().push({ type: "text", start: pos, end: fence.start });
    closeBodyAt(fence.start);
    pos = fence.end;
    const top = stack[stack.length - 1];
    const sameLevel = top !== undefined && top.colons === fence.colons;

    switch (fence.keyword) {
      case null:
        error(
          fence,
          `Unknown block "${fence.arg.split(/\s/)[0]}": use ::: if, ::: else if, ::: else, ::: from, ::: style, ::: text, ::: markdown, ::: html, ::: image, or ::: to close`,
        );
        break;
      case "if": {
        if (!fence.arg) error(fence, "::: if needs a condition, e.g. ::: if $var.group.is('a')");
        const node: Extract<TemplateNode, { type: "if" }> = { type: "if", start: fence.start, branches: [] };
        node.branches.push({ script: fence.arg, references: script(fence), start: fence.start, body: [], bodyStart: pos, bodyEnd: pos });
        body().push(node);
        stack.push({ kind: "if", node, colons: fence.colons });
        break;
      }
      case "else if":
      case "else": {
        const branches = top?.kind === "if" && sameLevel ? top.node.branches : null;
        if (!branches) {
          error(fence, `::: ${fence.keyword} must follow a ::: if (with as many colons)`);
          break;
        }
        if (branches[branches.length - 1].script === null) {
          error(fence, `::: ${fence.keyword} after ::: else`);
          break;
        }
        if (fence.keyword === "else" && fence.arg) error(fence, `Use "::: else if <condition>" for a condition`);
        if (fence.keyword === "else if" && !fence.arg) error(fence, "::: else if needs a condition");
        const isElse = fence.keyword === "else";
        branches.push({
          script: isElse ? null : fence.arg,
          references: isElse ? [] : script(fence),
          start: fence.start,
          body: [],
          bodyStart: pos,
          bodyEnd: pos,
        });
        break;
      }
      case "from": {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(fence.arg)) error(fence, "::: from needs the name of a question of this loop, e.g. ::: from topics");
        const stage: FromStage = { question: fence.arg, start: fence.start, body: [], bodyStart: pos, bodyEnd: pos };
        if (top?.kind === "from" && sameLevel) {
          top.node.stages.push(stage);
          break;
        }
        const node: Extract<TemplateNode, { type: "from" }> = { type: "from", start: fence.start, stages: [stage] };
        body().push(node);
        stack.push({ kind: "from", node, colons: fence.colons });
        break;
      }
      case "text":
      case "markdown":
      case "html":
      case "image": {
        if (fence.arg && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(fence.arg)) {
          error(fence, `::: ${fence.keyword} ${fence.arg}: a name is letters, digits and _ (e.g. ::: ${fence.keyword} highlighted)`);
        }
        const outer = stack.find((o) => o.kind === "display");
        if (outer) error(fence, `A ::: ${fence.keyword} block can't be inside a ::: ${(outer.node as DisplayNode).kind} block`);
        const node: DisplayNode = {
          type: "display",
          kind: fence.keyword,
          ...(fence.arg ? { name: fence.arg } : {}),
          start: fence.start,
          body: [],
          bodyStart: pos,
          bodyEnd: pos,
        };
        body().push(node);
        stack.push({ kind: "display", node, colons: fence.colons });
        break;
      }
      case "style": {
        const parsed = parseInlineCss(fence.arg);
        for (const message of parsed.errors) error(fence, message);
        // Styles are markdown: only a markdown block's content can have them.
        const display = stack.find((o) => o.kind === "display")?.node as DisplayNode | undefined;
        if (display && display.kind !== "markdown") error(fence, `A ::: style block can't be inside a ::: ${display.kind} block (it can be inside ::: markdown)`);
        const node: Extract<TemplateNode, { type: "style" }> = {
          type: "style",
          css: fence.arg,
          style: parsed.style,
          start: fence.start,
          body: [],
          bodyStart: pos,
          bodyEnd: pos,
        };
        body().push(node);
        stack.push({ kind: "style", node, colons: fence.colons });
        break;
      }
      case "close":
        if (!top) error(fence, "::: closes nothing: no block is open");
        else {
          if (!sameLevel) error(fence, `This ::: closes a block opened with ${top.colons} colons: use ${":".repeat(top.colons)}`);
          stack.pop();
        }
        break;
    }
  }
  if (source.length > pos) body().push({ type: "text", start: pos, end: source.length });
  closeBodyAt(source.length);
  for (const open of stack) {
    const what = open.kind === "display" ? `::: ${open.node.kind}` : `::: ${open.kind}`;
    errors.push({ message: `${what} is not closed (end it with ${":".repeat(open.colons)})`, start: open.node.start, end: open.node.start + 3 });
  }
  return { nodes: root, errors, hasBlocks: fences.length > 0 };
}

/** CSS properties a block may not use: they would take the text out of the unit area, over the app's controls. */
const POSITION_NOT_ALLOWED = /^(fixed|sticky)$/i;

/**
 * `color: darkred; font-size: 120%` as a React style object
 * (`{ color: "darkred", fontSize: "120%" }`). Values are used as written:
 * React sets them per property, so they can't add selectors or run code.
 */
export function parseInlineCss(css: string): { style: Record<string, string>; errors: string[] } {
  const style: Record<string, string> = {};
  const errors: string[] = [];
  for (const raw of css.split(";")) {
    const declaration = raw.trim();
    if (!declaration) continue;
    const colon = declaration.indexOf(":");
    const property = colon === -1 ? "" : declaration.slice(0, colon).trim().toLowerCase();
    const value = colon === -1 ? "" : declaration.slice(colon + 1).trim();
    if (!/^(--)?[a-z][a-z0-9-]*$/.test(property) || !value) {
      errors.push(`"${declaration}" is not a CSS declaration (property: value)`);
      continue;
    }
    if (property === "position" && POSITION_NOT_ALLOWED.test(value)) {
      errors.push(`position: ${value} isn't allowed: it would place the text over the app`);
      continue;
    }
    const key = property.startsWith("--") ? property : property.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    style[key] = value;
  }
  if (Object.keys(style).length === 0 && errors.length === 0) errors.push("::: style needs CSS, e.g. ::: style color: darkred; font-size: 120%");
  return { style, errors };
}

/** Every reference in a template: in its values and in its blocks' conditions. */
export function allTemplateReferences(source: string): Reference[] {
  const refs = [...templateReferences(source).references];
  const walk = (nodes: TemplateNode[]) => {
    for (const node of nodes) {
      if (node.type === "if") {
        for (const branch of node.branches) {
          refs.push(...branch.references);
          walk(branch.body);
        }
      } else if (node.type === "from") node.stages.forEach((stage) => walk(stage.body));
      else if (node.type === "style" || node.type === "display") walk(node.body);
    }
  };
  walk(parseTemplateBlocks(source).nodes);
  return refs;
}

/**
 * The name of a value: `unit.<field>` for a unit field, `var.<question>`
 * for an answer (shown as `$unit.x` / `$var.q...`, or alone in `{{ }}`);
 * scripts have none. Marks the value's element (`data-field`).
 */
export function valueName(expression: TemplateExpression): string | undefined {
  const only = expression.references.length === 1 ? expression.references[0] : undefined;
  const ref = expression.ref ?? (only && expression.script === referenceText(only) ? only : undefined);
  return ref ? `${ref.ns}.${ref.path[0]}` : undefined;
}

/**
 * The names a template shows (values of unit fields and answers, and named
 * typed blocks), and the ones span questions can select in: unit fields
 * shown as plain text, and named `::: text` blocks. Values inside a typed
 * block are part of its content, not elements of their own.
 */
export function templateNames(source: string): { shown: string[]; selectable: string[] } {
  const shown = new Set<string>();
  const selectable = new Set<string>();
  const displays: DisplayNode[] = [];
  const walk = (nodes: TemplateNode[]) => {
    for (const node of nodes) {
      if (node.type === "if") node.branches.forEach((b) => walk(b.body));
      else if (node.type === "from") node.stages.forEach((s) => walk(s.body));
      else if (node.type === "style") walk(node.body);
      else if (node.type === "display") displays.push(node);
    }
  };
  walk(parseTemplateBlocks(source).nodes);
  for (const segment of parseTemplate(source).segments) {
    if (segment.type !== "expression") continue;
    if (displays.some((d) => segment.start >= d.bodyStart && segment.start < d.bodyEnd)) continue;
    const name = valueName(segment);
    if (!name) continue;
    shown.add(name);
    if (name.startsWith("unit.") && segment.suffix === "text") selectable.add(name);
  }
  for (const d of displays) {
    if (!d.name) continue;
    shown.add(d.name);
    if (d.kind === "text") selectable.add(d.name);
  }
  return { shown: [...shown], selectable: [...selectable] };
}
