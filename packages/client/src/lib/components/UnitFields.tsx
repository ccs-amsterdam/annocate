import { useEffect, useRef, type CSSProperties } from "react";
import type { UnitLayout } from "@annotinder/contracts";
import type { RenderedTemplate } from "../codebook/renderTemplate";
import { TemplateMarkdown } from "./TemplateMarkdown";
import { cn } from "cn";

/**
 * Renders a unit's layout (docs/client.md §3): its template, with the
 * values already evaluated (`renderTemplate`, done by `JobManager`). With
 * `focusField` (the question's `field`, or a span question's column) the
 * field's element (`data-field`) is scrolled into view and briefly
 * highlighted when the question comes up. A layout's `colorScheme` shows
 * the unit always light or dark.
 */
export function UnitFields({
  layout,
  rendered,
  focusField,
}: {
  layout: UnitLayout;
  rendered: RenderedTemplate;
  focusField?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusField || !ref.current) return;
    const element = ref.current.querySelector<HTMLElement>(`[data-field="${CSS.escape(focusField)}"]`);
    if (!element) return;
    element.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    element.classList.remove("field-focus");
    void element.offsetWidth; // restart the animation
    element.classList.add("field-focus");
  }, [focusField, rendered]);

  return (
    <div
      ref={ref}
      style={layout.style as CSSProperties | undefined}
      className={cn(
        "template-markdown flex flex-col gap-4 text-foreground",
        // A fixed colour scheme (layout.colorScheme): the unit in its own colours, whatever the coder chose.
        layout.colorScheme && [layout.colorScheme, "rounded-lg bg-background p-3"],
      )}
    >
      <TemplateMarkdown rendered={rendered} />
    </div>
  );
}
