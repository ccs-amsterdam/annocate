import { useEffect, useRef, type CSSProperties } from "react";
import type { UnitLayout } from "@annotinder/contracts";
import type { RenderedTemplate } from "../codebook/renderTemplate";
import { TemplateMarkdown } from "./TemplateMarkdown";
import { cn } from "cn";

/**
 * Renders a unit's layout (docs/client.md §3): its template, with the
 * values already evaluated (`renderTemplate`, done by `JobManager`). `focus`
 * (the question's focus, or a span question's fields) are ids of elements
 * (`data-field`): they are marked, and the first is scrolled into view and
 * briefly highlighted when the question comes up; with `focusDim` the rest
 * of the unit is dimmed. A layout's `colorScheme` shows the unit always
 * light or dark.
 */
export function UnitFields({
  layout,
  rendered,
  focus,
  focusDim = false,
}: {
  layout: UnitLayout;
  rendered: RenderedTemplate;
  focus?: readonly string[];
  focusDim?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const focusKey = (focus ?? []).join("\n");
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const ids = focusKey ? focusKey.split("\n") : [];
    const elements = ids.flatMap((id) => [...root.querySelectorAll<HTMLElement>(`[data-field="${CSS.escape(id)}"]`)]);
    for (const element of root.querySelectorAll<HTMLElement>("[data-focused]")) element.removeAttribute("data-focused");
    for (const element of elements) element.setAttribute("data-focused", "");
    const first = elements[0];
    if (!first) return;
    first.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    first.classList.remove("field-focus");
    void first.offsetWidth; // restart the animation
    first.classList.add("field-focus");
  }, [focusKey, rendered]);

  return (
    <div
      ref={ref}
      style={layout.style as CSSProperties | undefined}
      className={cn(
        "template-markdown flex flex-col gap-4 text-foreground",
        // A fixed colour scheme (layout.colorScheme): the unit in its own colours, whatever the coder chose.
        layout.colorScheme && [layout.colorScheme, "rounded-lg bg-background p-3"],
        focusDim && focus && focus.length > 0 && "focus-dim",
      )}
    >
      <TemplateMarkdown rendered={rendered} />
    </div>
  );
}
