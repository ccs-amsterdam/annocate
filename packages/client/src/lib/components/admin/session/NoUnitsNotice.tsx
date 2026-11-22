import { useState, type ReactNode } from "react";
import { Layers } from "lucide-react";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useUnitsQuery } from "../../../admin/queries";

/**
 * Without units, coder unit assignments have nothing to assign: says so,
 * and points to the Units page. The settings stay reachable (folded): who
 * the coder is and how they get in still matter for a survey.
 */
export function NoUnitsNotice({ client, children }: { client: ResearcherApi; children: ReactNode }) {
  const units = useUnitsQuery(client).data;
  const [open, setOpen] = useState(false);
  if (!units || units.length > 0) return <>{children}</>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
        <Layers className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="flex flex-col gap-1">
          <p>
            This study has no units yet, so there is nothing to assign to coders. Upload units on the{" "}
            <strong>Units</strong> page.
          </p>
          <p className="text-xs text-muted-foreground">
            You could of course also use AnnoTinder without annotating any units. Kinda weird to use an annotation tool
            for your surveys, but we&apos;re not judging you.
          </p>
        </div>
      </div>
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="text-sm">
        <summary className="cursor-pointer text-muted-foreground select-none hover:text-foreground">
          Show the settings anyway (who the coder is, how they get in)
        </summary>
        <div className="mt-3">{children}</div>
      </details>
    </div>
  );
}
