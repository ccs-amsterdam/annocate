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
 * template, rendered with `react-markdown` (no raw-HTML support -- safe by
 * construction, no `dangerouslySetInnerHTML`) plus `remark-directive` for
 * the `::field[name]` / `::tokenize[name]` directives that hook in
 * "special" rendering of a unit data column or layout constant (images,
 * nested markdown, and annotatable text for the currently-active `span`
 * variable, design plan §11b/§11f).
 *
 * `template` is expected to already have its `{{ expression }}`
 * interpolation resolved (via `renderTemplate`, which is async since it
 * evaluates real QuickJS expressions) -- see `JobManager.resolveUnitLayout`,
 * which does this once per unit and publishes the already-resolved string,
 * keeping this component itself synchronous.
 *
 * Relation annotation UI is still unimplemented (design plan §11a/§12);
 * only span selection is wired up so far.
 */
export function UnitFields({ layout, data }: { layout: UnitLayout; data: UnitData }) {
  const annotation = useSpanAnnotation();
  // `::field`/`::tokenize` resolve against unit data columns first, falling
  // back to the layout's own named constants (§11f) -- one shared namespace.
  const lookup: Record<string, unknown> = { ...layout.constants, ...data };

  const components: Components = {
    // Custom element name produced by `remarkUnitField`'s hName; react-markdown
    // passes the directive's hProperties straight through as props.
    // @ts-expect-error "unit-field" isn't a standard HTML tag name.
    "unit-field": ({ mode, name, as, markdown }: { mode?: string; name?: string; as?: string; markdown?: string }) => {
      if (!name) return null;
      const value = lookup[name];
      const text = value === undefined ? "" : String(value);

      if (as === "image") return <img src={text} alt={name} className="max-w-full" />;

      if (mode === "tokenize") {
        if (annotation && annotation.column === name) return <SelectableText text={text} />;
        return <span className="whitespace-pre-wrap">{text}</span>;
      }

      // mode === "field": plain text, or nested markdown when {markdown=true}.
      // NOT combined with tokenize -- rendered/stripped markdown text no
      // longer lines up 1:1 with the raw string's character offsets, so a
      // `::field[...]{markdown=true}` reference can't also back a `span`
      // variable's `column` (not yet enforced at the schema level, design
      // plan §11f "STILL OPEN").
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
    <div style={layout.style as CSSProperties | undefined} className="flex flex-col gap-4">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkDirective, remarkUnitField]} components={components}>
        {layout.template}
      </ReactMarkdown>
    </div>
  );
}
