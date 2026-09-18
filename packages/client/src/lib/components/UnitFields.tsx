import type { CSSProperties } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import type { UnitData, UnitLayout } from "@annotinder/contracts";
import { renderTemplate } from "../codebook/renderTemplate";
import { remarkUnitField } from "../codebook/unitFieldDirective";
import { useSpanAnnotation } from "../context/SpanAnnotationContext";
import { SelectableText } from "./SelectableText";

/**
 * Renders a unit's layout (design plan §11c, resolved): a single markdown
 * template, rendered with `react-markdown` (no raw-HTML support -- safe by
 * construction, no `dangerouslySetInnerHTML` -- see design plan §11c) plus
 * `remark-directive` for the `::field[column]` directive that hooks in
 * "special" per-column rendering (images, and annotatable text for the
 * currently-active `span` variable, design plan §11b).
 *
 * Relation annotation UI is still unimplemented (design plan §11a/§12);
 * only span selection is wired up so far.
 */
export function UnitFields({ layout, data }: { layout: UnitLayout; data: UnitData }) {
  const annotation = useSpanAnnotation();
  const markdown = renderTemplate(layout.template, data);

  const components: Components = {
    // Custom element name produced by `remarkUnitField`'s hName; react-markdown
    // passes the directive's hProperties straight through as props.
    // @ts-expect-error "unit-field" isn't a standard HTML tag name.
    "unit-field": ({ column, as }: { column?: string; as?: string }) => {
      if (!column) return null;
      const value = data[column];
      const text = value === undefined ? "" : String(value);

      if (as === "image") return <img src={text} alt={column} className="max-w-full" />;
      if (annotation && annotation.column === column) return <SelectableText text={text} />;
      return <span className="whitespace-pre-wrap">{text}</span>;
    },
  };

  return (
    <div style={layout.style as CSSProperties | undefined} className="flex flex-col gap-4">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkDirective, remarkUnitField]} components={components}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
