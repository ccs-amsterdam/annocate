import type { CSSProperties } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkDirective from "remark-directive";
import remarkGfm from "remark-gfm";
import type { UnitData, UnitLayout } from "@annotinder/contracts";
import { remarkUnitField } from "../codebook/unitFieldDirective";
import { useSpanAnnotation } from "../context/SpanAnnotationContext";
import { SelectableText } from "./SelectableText";

/**
 * Renders a unit's layout (design plan §11c/§11f): a single markdown
 * template, rendered with `react-markdown` plus `remark-directive` for
 * the `::field[name]` / `::tokenize[name]` directives (also supporting
 * `$unit.fieldname` syntax).
 */
export function UnitFields({ layout, data }: { layout: UnitLayout; data: UnitData }) {
  const annotation = useSpanAnnotation();
  // Build lookup supporting both raw field names ('headline') and '$unit.headline'
  const unitLookup: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    unitLookup[`$unit.${k}`] = v;
  }
  const lookup: Record<string, unknown> = { ...layout.constants, ...data, ...unitLookup };

  const components: Components = {
    // Custom element name produced by `remarkUnitField`'s hName
    // @ts-expect-error "unit-field" isn't a standard HTML tag name.
    "unit-field": ({ mode, name, as, markdown }: { mode?: string; name?: string; as?: string; markdown?: string }) => {
      if (!name) return null;
      const stripped = name.replace(/^\$unit\./, "");
      const value = lookup[name] ?? lookup[stripped];
      const text = value === undefined ? "" : String(value);

      if (as === "image") return <img src={text} alt={stripped} className="max-w-full" />;

      if (mode === "tokenize") {
        const isTarget = annotation && (annotation.column === stripped || annotation.column === name);
        if (isTarget) return <SelectableText text={text} />;
        return <span className="whitespace-pre-wrap">{text}</span>;
      }

      if (markdown === "true") {
        return (
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkDirective, remarkUnitField]} components={components}>
            {text}
          </ReactMarkdown>
        );
      }
      return <span className="whitespace-pre-wrap">{text}</span>;
    },
  };

  return (
    <div style={layout.style as CSSProperties | undefined} className="flex flex-col gap-4 text-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkDirective, remarkUnitField]} components={components}>
        {layout.template}
      </ReactMarkdown>
    </div>
  );
}
