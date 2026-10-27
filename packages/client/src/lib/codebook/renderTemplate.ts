import {
  outputText,
  parseTemplate,
  parseTemplateBlocks,
  referenceText,
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
  /** The value as text (`outputText`): the literal text, markdown source, image URL or text to tokenize. */
  text: string;
  /** For `::tokenize`: the unit field or constant it shows (span questions target it by name). */
  name?: string;
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

/**
 * The text of the blocks that show (docs/client.md §3, "Blocks"): of an
 * `if` the first branch whose condition holds, of a `from` chain the last
 * stage whose question is reached; a `style` block's content between
 * marker paragraphs.
 */
async function selectBlocks(
  source: string,
  nodes: TemplateNode[],
  holds: (script: string, at: number) => Promise<boolean>,
  progress: TemplateProgress | undefined,
  styles: Record<string, string>[],
): Promise<string> {
  let out = "";
  for (const node of nodes) {
    if (node.type === "text") out += source.slice(node.start, node.end);
    else if (node.type === "if") {
      for (const branch of node.branches) {
        if (branch.script === null || (await holds(branch.script, branch.start))) {
          out += await selectBlocks(source, branch.body, holds, progress, styles);
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
      if (stage) out += await selectBlocks(source, stage.body, holds, progress, styles);
    } else {
      const index = styles.push(node.style) - 1;
      const body = await selectBlocks(source, node.body, holds, progress, styles);
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

function toValue(expression: TemplateExpression, value: unknown): TemplateValue {
  const name = expression.suffix === "tokenize" && expression.ref ? expression.ref.path[0] : undefined;
  // `{{$unit.x}}` is the same as `$unit.x`
  const only = expression.references.length === 1 ? expression.references[0] : undefined;
  const ref = expression.ref ?? (only && expression.script === referenceText(only) ? only : undefined);
  const field = ref?.ns === "unit" ? ref.path[0] : undefined;
  return { suffix: expression.suffix, text: outputText(value), name, block: expression.alone, ...(field ? { field } : {}) };
}

/**
 * Evaluates a template's values (the unit layout, or a question or
 * instruction text) against a `{ $unit, $var, $const }` scope.
 * `keyPrefix` names the template's slots in the cache.
 */
export async function renderTemplate(
  source: string,
  scope: ReferenceScope,
  cache?: ExpressionCache,
  keyPrefix = "template",
  progress?: TemplateProgress,
): Promise<RenderedTemplate> {
  const blocks = parseTemplateBlocks(source);
  const styles: Record<string, string>[] = [];
  if (blocks.hasBlocks) {
    const holds = (script: string, at: number) => evaluateCondition({ script }, scope, cache, `${keyPrefix}:if:${at}`);
    source = await selectBlocks(source, blocks.nodes, holds, progress, styles);
  }
  const { markdown, expressions } = prepareTemplate(source);
  const results = await Promise.all(
    expressions.map((e, i) => (cache ? cache.evaluate(`${keyPrefix}:${i}`, e.script, scope) : evaluateScript(e.script, scope))),
  );
  return { markdown, values: expressions.map((e, i) => toValue(e, results[i])), styles };
}

/** A template without evaluating it: every value shows its own source (e.g. `$var.role.code`), every block's content shows. For previews. */
export function staticTemplate(source: string): RenderedTemplate {
  const { markdown, expressions } = prepareTemplate(source);
  return {
    markdown,
    values: expressions.map((e) => ({
      ...toValue(e, source.slice(e.start, e.end)),
      suffix: e.suffix === "image" ? "text" : e.suffix,
    })),
  };
}
