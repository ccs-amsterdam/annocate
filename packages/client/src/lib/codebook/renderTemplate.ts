import {
  outputText,
  parseTemplate,
  expandSnippets,
  parseTemplateBlocks,
  valueName,
  type DisplayKind,
  type TemplateNode,
  type OutputSuffix,
  type ReferenceScope,
  type TemplateExpression,
} from "@annotinder/contracts";
import { evaluateScript } from "./expression";
import { evaluateCondition } from "./conditions";
import type { ExpressionCache } from "./expressionCache";

/** One evaluated value in a template, rendered by its suffix (docs/client.md §3). */
export interface TemplateValue {
  suffix: OutputSuffix;
  /** The value as text (`outputText`): the literal text, markdown source, image URL or HTML. */
  text: string;
  /** A unit field a span question of the loop selects in: shown as selectable text, during every question. */
  selectable?: boolean;
  /** Stands alone on its line: rendered as a block. */
  block: boolean;
  /** For a bare `$unit.<field>`: the field, marked on the element (`data-field`) so a question can scroll to it. */
  field?: string;
}

/**
 * A template ready to render: markdown in which every value is a
 * placeholder, plus the values. Values never pass through the markdown
 * parser (unless `::markdown`), so plain text needs no escaping.
 */
export interface RenderedTemplate {
  markdown: string;
  values: TemplateValue[];
  /** The styles of `::: style` blocks, by the index in their markers (`STYLE_OPEN`). */
  styles?: Record<string, string>[];
}

/**
 * Where the coder is in a loop, for `::: from` blocks: the question on
 * screen and the loop's questions in order. A stage shows from its
 * question on (also when it is skipped).
 */
export interface TemplateProgress {
  current: string | null;
  order: string[];
}

/** Marker paragraphs around the content of a `::: style` block (private-use characters), grouped by `remarkTemplateValues`. */
export const STYLE_OPEN = /^\uE010(\d+)\uE011$/;
export const STYLE_CLOSE = "\uE012";
const styleOpen = (i: number) => `\uE010${i}\uE011`;

/** A typed block that shows (`::: markdown intro`), its content with the blocks inside it chosen. */
interface ShownDisplay {
  kind: DisplayKind;
  name?: string;
  content: string;
  start: number;
}

/** A marker paragraph for a typed block, replaced by a value placeholder once the values are known. */
const DISPLAY_MARK = /\uE020(\d+)\uE021/g;
const displayMark = (i: number) => `\uE020${i}\uE021`;

/**
 * The text of the blocks that show (docs/client.md §3, "Blocks"): of an
 * `if` the first branch whose condition holds, of a `from` chain the last
 * stage whose question is reached; a `style` block's content between
 * marker paragraphs; a typed block as a marker paragraph (its content goes
 * to `displays`).
 */
async function selectBlocks(
  source: string,
  nodes: TemplateNode[],
  holds: (script: string, at: number) => Promise<boolean>,
  progress: TemplateProgress | undefined,
  styles: Record<string, string>[],
  displays: ShownDisplay[],
): Promise<string> {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text") out += source.slice(node.start, node.end);
    else if (node.type === "if") {
      for (const branch of node.branches) {
        if (branch.script === null || (await holds(branch.script, branch.start))) {
          out += await selectBlocks(source, branch.body, holds, progress, styles, displays);
          break;
        }
      }
    } else if (node.type === "from") {
      const at = progress?.current ? progress.order.indexOf(progress.current) : -1;
      const reached = node.stages.filter((stage) => {
        const index = progress?.order.indexOf(stage.question) ?? -1;
        return at >= 0 && index >= 0 && index <= at;
      });
      const stage = reached[reached.length - 1];
      if (stage) out += await selectBlocks(source, stage.body, holds, progress, styles, displays);
    } else if (node.type === "display") {
      const content = await selectBlocks(source, node.body, holds, progress, styles, displays);
      const index = displays.push({ kind: node.kind, name: node.name, content, start: node.start }) - 1;
      out += `\n\n${displayMark(index)}\n\n`;
    } else {
      const index = styles.push(node.style) - 1;
      const body = await selectBlocks(source, node.body, holds, progress, styles, displays);
      out += `\n\n${styleOpen(index)}\n\n${body}\n\n${STYLE_CLOSE}\n\n`;
    }
  }
  return out;
}

/** Private-use characters around a value's index; they can't clash with markdown syntax or ordinary text. */
export const PLACEHOLDER = /(\d+)/g;
const placeholder = (i: number) => `${i}`;

/**
 * Pre-pass over a template: each `$ref` / `{{ }}` becomes a placeholder.
 * One that stands alone on its line becomes its own block (like a leaf
 * directive: it interrupts a paragraph).
 */
export function prepareTemplate(source: string): { markdown: string; expressions: TemplateExpression[] } {
  let markdown = "";
  const expressions: TemplateExpression[] = [];
  for (const segment of parseTemplate(source).segments) {
    if (segment.type === "text") {
      markdown += segment.text;
      continue;
    }
    const mark = placeholder(expressions.length);
    expressions.push(segment);
    if (segment.alone) {
      const lineStart = markdown.lastIndexOf("\n") + 1;
      const indent = markdown.slice(lineStart);
      markdown = `${markdown.slice(0, lineStart)}${lineStart > 0 ? "\n" : ""}${indent}${mark}\n`;
    } else {
      markdown += mark;
    }
  }
  return { markdown, expressions };
}

function toValue(expression: TemplateExpression, value: unknown, selectable: readonly string[] = []): TemplateValue {
  // `unit.<field>` or `var.<question>` (`{{$unit.x}}` is the same as `$unit.x`); scripts have no name
  const field = valueName(expression);
  const suffix = expression.suffix;
  return {
    suffix,
    text: outputText(value),
    block: expression.alone,
    ...(field ? { field } : {}),
    ...(field && suffix === "text" && selectable.includes(field) ? { selectable: true } : {}),
  };
}

/**
 * A typed block's content with its values put in as they are (a suffix is
 * the short form of a block around one value, so inside a block there is
 * none); `\$` stays an escape only in markdown.
 */
async function displayContent(
  display: ShownDisplay,
  evaluate: (key: string, script: string) => Promise<unknown>,
): Promise<string> {
  let out = "";
  // Without the line break before the closing fence
  const segments = parseTemplate(display.content.replace(/\n$/, "")).segments;
  for (const [j, segment] of segments.entries()) {
    if (segment.type === "text") out += display.kind === "markdown" ? segment.text : segment.text.replace(/\\\$/g, "$");
    else out += outputText(await evaluate(`display:${display.start}:${j}`, segment.script));
  }
  return out;
}

/**
 * Evaluates a template's values (the unit layout, or a question or
 * instruction text) against a `{ $unit, $var }` scope.
 * `keyPrefix` names the template's slots in the cache.
 */
export async function renderTemplate(
  source: string,
  scope: ReferenceScope,
  cache?: ExpressionCache,
  keyPrefix = "template",
  {
    progress,
    snippets,
    selectable,
  }: {
    progress?: TemplateProgress;
    snippets?: Record<string, string>;
    /** The names span questions of the loop select in (`unit.<field>`, ::: text blocks): shown as selectable text. */
    selectable?: readonly string[];
  } = {},
): Promise<RenderedTemplate> {
  // Snippets first: as if typed into the template (contracts snippets.ts).
  source = expandSnippets(source, snippets).source;
  const blocks = parseTemplateBlocks(source);
  const styles: Record<string, string>[] = [];
  const displays: ShownDisplay[] = [];
  if (blocks.hasBlocks) {
    const holds = (script: string, at: number) => evaluateCondition({ script }, scope, cache, `${keyPrefix}:if:${at}`);
    source = await selectBlocks(source, blocks.nodes, holds, progress, styles, displays);
  }
  const evaluate = (key: string, script: string) =>
    cache ? cache.evaluate(`${keyPrefix}:${key}`, script, scope) : evaluateScript(script, scope);
  const prepared = prepareTemplate(source);
  const results = await Promise.all(prepared.expressions.map((e, i) => evaluate(String(i), e.script)));
  const values = prepared.expressions.map((e, i) => toValue(e, results[i], selectable));
  // Typed blocks: one value each, after the template's own (their marker becomes its placeholder).
  const first = values.length;
  for (const display of displays) {
    values.push({
      suffix: display.kind,
      text: await displayContent(display, evaluate),
      block: true,
      ...(display.name ? { field: display.name } : {}),
      ...(display.name && display.kind === "text" && selectable?.includes(display.name) ? { selectable: true } : {}),
    });
  }
  const markdown = prepared.markdown.replace(DISPLAY_MARK, (_, i: string) => placeholder(first + Number(i)));
  return { markdown, values, styles };
}

/** A template without evaluating it: every value shows its own source (e.g. `$var.role.code`), every block's content shows. For previews. */
export function staticTemplate(source: string): RenderedTemplate {
  const { markdown, expressions } = prepareTemplate(source);
  return {
    markdown,
    values: expressions.map((e) => ({
      ...toValue(e, source.slice(e.start, e.end)),
      suffix: e.suffix === "image" || e.suffix === "html" ? "text" : e.suffix,
    })),
  };
}
