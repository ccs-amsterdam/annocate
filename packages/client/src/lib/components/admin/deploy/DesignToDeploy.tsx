import { AlertTriangle } from "lucide-react";
import { changeKeys } from "../../../admin/deploy";
import type { DesignChange } from "../../../design/diff";

/**
 * The design part of a deploy: the draft version with a checkbox (the first
 * deploy always has it), what changed since the live version, what that does
 * to earlier answers, and the version's note. Without a draft, the live
 * version stays.
 */
export function DesignToDeploy({
  versionNumber,
  liveNumber,
  included,
  onIncludedChange,
  changes,
  valueWarnings,
  note,
  onNoteChange,
}: {
  /** The draft to deploy; null: there is none. */
  versionNumber: number | null;
  /** The version coders use now; null: nothing is deployed yet (the draft can't be left out). */
  liveNumber: number | null;
  included: boolean;
  onIncludedChange: (included: boolean) => void;
  /** What changed since the live version; null: nothing to compare with. */
  changes: DesignChange[] | null;
  /** What the changes do to earlier answers. */
  valueWarnings: string[];
  note: string;
  onNoteChange: (note: string) => void;
}) {
  if (versionNumber === null)
    return (
      <section className="space-y-2 rounded-md border border-border p-3">
        <p className="font-semibold text-foreground">Design: v{liveNumber} stays</p>
      </section>
    );
  return (
    <section className="space-y-2 rounded-md border border-border p-3">
      <label className="flex items-center gap-2 font-semibold text-foreground">
        <input
          type="checkbox"
          checked={included}
          disabled={liveNumber === null}
          onChange={(e) => onIncludedChange(e.target.checked)}
        />
        Design v{versionNumber}
      </label>
      {included ? (
        <>
          <ValueWarnings warnings={valueWarnings} />
          {changes && <Changes changes={changes} liveNumber={liveNumber} />}
          <label htmlFor="version-note" className="block font-medium text-foreground">
            What changed? <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <textarea
            id="version-note"
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="e.g. Added a question about sources"
            className="w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
          />
        </>
      ) : (
        <p className="text-xs text-muted-foreground">The draft stays a draft, for a later deploy.</p>
      )}
    </section>
  );
}

function ValueWarnings({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="space-y-2">
      {warnings.map((w, i) => (
        <li key={i} className="flex gap-2 rounded-md bg-amber-500/10 p-2 text-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          {w}
        </li>
      ))}
    </ul>
  );
}

/** The items that changed since the live version. */
function Changes({ changes, liveNumber }: { changes: DesignChange[]; liveNumber: number | null }) {
  if (changes.length === 0)
    return <p className="text-muted-foreground">No changes to the items since v{liveNumber}.</p>;
  const keys = changeKeys(changes);
  return (
    <ul className="space-y-1">
      {changes.map((c, i) => (
        <ChangeLine key={keys[i]} change={c} />
      ))}
    </ul>
  );
}

const KIND_LABEL: Record<DesignChange["kind"], { label: string; className: string }> = {
  added: { label: "Added", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  removed: { label: "Removed", className: "bg-destructive/15 text-destructive" },
  changed: { label: "Changed", className: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  moved: { label: "Moved", className: "bg-violet-500/15 text-violet-700 dark:text-violet-400" },
};

/** Where a changed item is (or moved to), after its name. */
function whereText(change: DesignChange): string {
  if (change.kind === "moved") return change.parent ? ` to ${change.parent}` : " to the top level";
  return change.parent ? ` in ${change.parent}` : "";
}

/** One changed item: added, removed, changed or moved, and where. */
function ChangeLine({ change }: { change: DesignChange }) {
  const { label, className } = KIND_LABEL[change.kind];
  return (
    <li className="flex items-center gap-2">
      <span className={`w-16 shrink-0 rounded px-1.5 py-0.5 text-center text-[11px] font-semibold ${className}`}>
        {label}
      </span>
      <span className="min-w-0 truncate text-foreground">
        <span className="font-mono">{change.name}</span>
        <span className="text-muted-foreground">
          {" "}
          ({change.type.replace("_", " ")}){whereText(change)}
        </span>
      </span>
    </li>
  );
}
