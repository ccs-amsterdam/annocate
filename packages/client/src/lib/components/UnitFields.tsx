import type { CSSProperties } from "react";
import type { UnitLayout } from "@annotinder/contracts";
import type { RenderedTemplate } from "../codebook/renderTemplate";
import { TemplateMarkdown } from "./TemplateMarkdown";

/**
 * Renders a unit's layout (docs/client.md §3): its template, with the
 * values already evaluated (`renderTemplate`, done by `JobManager`).
 */
export function UnitFields({ layout, rendered }: { layout: UnitLayout; rendered: RenderedTemplate }) {
  return (
    <div style={layout.style as CSSProperties | undefined} className="flex flex-col gap-4 text-foreground">
      <TemplateMarkdown rendered={rendered} />
    </div>
  );
}
