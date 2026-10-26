import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { RenderedTemplate, TemplateValue } from "../codebook/renderTemplate";
import { remarkTemplateValues } from "../codebook/templateValues";
import { useSpanAnnotation } from "../context/SpanAnnotationContext";
import { SelectableText } from "./SelectableText";

/**
 * Renders a template (docs/client.md §3): the unit layout, or a question or
 * instruction text. The markdown is rendered with `react-markdown` (no raw
 * HTML), and each value by its suffix: `text` as a React text node (never
 * parsed as markdown), `markdown` as nested markdown, `image` as an image,
 * `tokenize` as text a span question can select in.
 */
export function TemplateMarkdown({ rendered, components }: { rendered: RenderedTemplate; components?: Components }) {
  const allComponents = {
    ...components,
    "template-value": ({ index, block }: { index?: string; block?: string }) => {
      const value = rendered.values[Number(index)];
      return value ? <TemplateValueView value={value} block={block === "true"} /> : null;
    },
  } as Components;
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, [remarkTemplateValues, rendered.values]]} components={allComponents}>
      {rendered.markdown}
    </ReactMarkdown>
  );
}

/** Inline markdown values can't contain paragraphs (they're inside one). */
const INLINE_MARKDOWN: Components = { p: ({ children }) => <>{children}</> };

function TemplateValueView({ value, block }: { value: TemplateValue; block: boolean }) {
  const annotation = useSpanAnnotation();
  const wrap = (content: ReactNode, pre = true) =>
    block ? <div className={pre ? "whitespace-pre-wrap" : undefined}>{content}</div> : <span className={pre ? "whitespace-pre-wrap" : undefined}>{content}</span>;

  switch (value.suffix) {
    case "image":
      return value.text ? <img src={value.text} alt={value.name ?? ""} className="max-w-full" /> : null;
    case "markdown":
      return wrap(
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={block ? undefined : INLINE_MARKDOWN}>
          {value.text}
        </ReactMarkdown>,
        false,
      );
    case "tokenize":
      if (annotation && value.name !== undefined && annotation.column === value.name) {
        return wrap(<SelectableText text={value.text} />, false);
      }
      return wrap(value.text);
    default:
      return wrap(value.text);
  }
}
