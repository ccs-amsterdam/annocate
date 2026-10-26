import {
  outputText,
  parseTemplate,
  type OutputSuffix,
  type ReferenceScope,
  type TemplateExpression,
} from "@annotinder/contracts";
import { evaluateScript } from "./expression";
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
}

/**
 * A template ready to render: markdown in which every value is a
 * placeholder, plus the values. Values never pass through the markdown
 * parser (unless `::markdown`), so plain text needs no escaping.
 */
export interface RenderedTemplate {
  markdown: string;
  values: TemplateValue[];
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
  return { suffix: expression.suffix, text: outputText(value), name, block: expression.alone };
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
): Promise<RenderedTemplate> {
  const { markdown, expressions } = prepareTemplate(source);
  const results = await Promise.all(
    expressions.map((e, i) => (cache ? cache.evaluate(`${keyPrefix}:${i}`, e.script, scope) : evaluateScript(e.script, scope))),
  );
  return { markdown, values: expressions.map((e, i) => toValue(e, results[i])) };
}

/** A template without evaluating it: every value shows its own source (e.g. `$var.role.code`). For previews. */
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
