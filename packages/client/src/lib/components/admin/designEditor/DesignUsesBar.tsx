import { FlaskConical, Layers, ListChecks, Rows3, type LucideIcon } from "lucide-react";
import { designUses, usesConflicts, type DesignUses } from "@annotinder/contracts";
import { cn } from "cn";
import { InfoTip } from "@/components/ui/info-tip";
import type { DesignDraft } from "./useDesignDraft";

const CONTENT: { value: DesignUses["content"]; label: string; icon: LucideIcon; title: string }[] = [
  {
    value: "annotate",
    label: "Annotate units",
    icon: Layers,
    title: "Coders code units: one unit loop, nothing outside it",
  },
  { value: "questions", label: "Questions", icon: ListChecks, title: "Coders answer questions: no units" },
  { value: "both", label: "Both", icon: Rows3, title: "Questions and unit loops, in any order" },
];

/** Why a choice can't be made now: what in the design is in the way (empty: it can). */
function blockedBy(uses: DesignUses, items: readonly unknown[]): string | null {
  const conflicts = usesConflicts(uses, items);
  if (conflicts.length === 0) return null;
  const shown = conflicts.slice(0, 3).map((c) => c.message);
  const more = conflicts.length > 3 ? ` (and ${conflicts.length - 3} more)` : "";
  return `Not possible now: ${shown.join("; ")}${more}`;
}

/**
 * At the top of the editor: what the design is made of (the Study entry's
 * `uses`, docs/client.md §7 "Editor modes"), so the editor shows only what
 * it needs. A choice that would hide something the design has is disabled,
 * and says what is in the way.
 */
export function DesignUsesBar({ draft, readOnly }: { draft: DesignDraft; readOnly: boolean }) {
  const uses = designUses(draft.items);
  const experimentBlock = uses.experiment ? blockedBy({ ...uses, experiment: false }, draft.items) : null;

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-border/60 px-2 pb-2"
      aria-label="What the design uses"
    >
      <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5" role="radiogroup">
        {CONTENT.map(({ value, label, icon: Icon, title }) => {
          const active = uses.content === value;
          const blocked = active ? null : blockedBy({ ...uses, content: value }, draft.items);
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={readOnly || blocked !== null}
              title={blocked ?? title}
              onClick={() => !active && draft.setUses({ ...uses, content: value })}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                active ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-muted-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
      </div>
      <label
        className={cn(
          "flex items-center gap-1.5 text-xs font-medium",
          (readOnly || experimentBlock) && "cursor-not-allowed opacity-60",
        )}
        title={experimentBlock ?? "Conditions that vary what coders get, and computed items"}
      >
        <input
          type="checkbox"
          className="accent-primary"
          checked={uses.experiment}
          disabled={readOnly || experimentBlock !== null}
          onChange={(e) => draft.setUses({ ...uses, experiment: e.target.checked })}
        />
        <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
        Experiment
      </label>
      <InfoTip label="About these choices">
        The editor shows what the design needs. <strong>Annotate units</strong>: one unit loop, whose items are the
        design. <strong>Questions</strong>: no units. <strong>Both</strong>: questions and any number of unit loops.{" "}
        <strong>Experiment</strong>: conditions that vary what coders get, and (with questions) computed items. A choice
        that would hide something the design has can&apos;t be made; hover it to see what is in the way.
      </InfoTip>
    </div>
  );
}
