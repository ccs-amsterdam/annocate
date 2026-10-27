import type { CSSProperties, ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { RenderedTemplate, TemplateValue } from "../codebook/renderTemplate";
import { remarkTemplateValues } from "../codebook/templateValues";
import { SelectableText } from "./SelectableText";
import { SandboxedHtml } from "./SandboxedHtml";

/**
 * Renders a template (docs/client.md §3): the unit layout, or a question or
 * instruction text. The markdown is rendered with `react-markdown` (no raw
 * HTML), and each value by its suffix: `text` as a React text node (never
 * parsed as markdown), `markdown` as nested markdown, `image` as an image,
 * `html` in a sandboxed iframe; a unit field span questions select in as
 * selectable text.
 */
export function TemplateMarkdown({ rendered, components }: { rendered: RenderedTemplate; components?: Components }) {
  const allComponents = {
    ...components,
    "template-value": ({ index, block }: { index?: string; block?: string }) => {
      const value = rendered.values[Number(index)];
      return value ? <TemplateValueView value={value} block={block === "true"} styles={rendered.styles} /> : null;
    },
    // A `::: style` block (docs/client.md §3, "Blocks")
    "template-style": ({ index, children }: { index?: string; children?: ReactNode }) => (
      <div className="flex flex-col gap-4" style={rendered.styles?.[Number(index)] as CSSProperties | undefined}>
        {children}
      </div>
    ),
  } as Components;
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm, [remarkTemplateValues, rendered.values]]} components={allComponents}>
      {rendered.markdown}
    </ReactMarkdown>
  );
}

/** Inline markdown values can't contain paragraphs (they're inside one). */
const INLINE_MARKDOWN: Components = { p: ({ children }) => <>{children}</> };

/** `::: style` blocks in a markdown value (a constant's own blocks: renderTemplate). */
function styleComponents(styles: Record<string, string>[] | undefined): Components {
  return {
    "template-style": ({ index, children }: { index?: string; children?: ReactNode }) => (
      <div className="flex flex-col gap-4" style={styles?.[Number(index)] as CSSProperties | undefined}>
        {children}
      </div>
    ),
  } as Components;
}

function TemplateValueView({ value, block, styles }: { value: TemplateValue; block: boolean; styles?: Record<string, string>[] }) {
  // A unit field's element is marked (data-field), so a question can scroll to it (UnitFields).
  const field = value.field ? { "data-field": value.field } : {};
  const wrap = (content: ReactNode, pre = true) =>
    block ? (
      <div className={pre ? "whitespace-pre-wrap" : undefined} {...field}>
        {content}
      </div>
    ) : (
      <span className={pre ? "whitespace-pre-wrap" : undefined} {...field}>
        {content}
      </span>
    );

  switch (value.suffix) {
    case "image":
      return value.text ? <img src={value.text} alt={value.field ?? ""} className="max-w-full" {...field} /> : null;
    case "html":
      // Researchers' or units' own HTML, in a sandbox (SandboxedHtml.tsx)
      return value.text ? (
        <div {...field}>
          <SandboxedHtml html={value.text} title={value.field ?? "HTML content"} />
        </div>
      ) : null;
    case "markdown":
      return wrap(
        <ReactMarkdown
          remarkPlugins={[remarkGfm, [remarkTemplateValues, []]]}
          components={{ ...styleComponents(styles), ...(block ? {} : INLINE_MARKDOWN) }}
        >
          {value.text}
        </ReactMarkdown>,
        false,
      );
    default:
      // A field span questions select in: the same element during every
      // question (selecting only works during theirs), so nothing shifts.
      if (value.selectable && value.field) {
        return wrap(<SelectableText text={value.text} field={value.field} inline={!block} />, false);
      }
      return wrap(value.text);
  }
}
