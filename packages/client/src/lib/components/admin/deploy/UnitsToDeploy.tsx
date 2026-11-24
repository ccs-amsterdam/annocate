import type { ReactNode } from "react";
import type { PendingChanges } from "@annotinder/contracts";
import { InfoTip } from "@/components/ui/info-tip";
import { describeUnitChanges } from "../../../admin/unitChanges";

type UnitChanges = PendingChanges["units"];

/**
 * The units part of a deploy: the draft units and sets with a checkbox (the
 * first deploy always has them), or that nothing changed. `children`: what
 * is asked when they are deployed to a live study.
 */
export function UnitsToDeploy({
  changes,
  changed,
  firstDeploy,
  included,
  onIncludedChange,
  children,
}: {
  /** The draft units against the deployed ones; null: not known yet. */
  changes: UnitChanges | null;
  changed: boolean;
  firstDeploy: boolean;
  included: boolean;
  onIncludedChange: (included: boolean) => void;
  children?: ReactNode;
}) {
  if (!firstDeploy && !changed)
    return (
      <section className="space-y-1 rounded-md border border-border p-3">
        <p className="font-semibold text-foreground">Units and sets: no changes</p>
      </section>
    );
  const summary = changes && (firstDeploy ? `${changes.added} units` : describeUnitChanges(changes));
  return (
    <section className="space-y-1 rounded-md border border-border p-3">
      <label className="flex items-center gap-2 font-semibold text-foreground">
        <input
          type="checkbox"
          checked={included}
          disabled={firstDeploy}
          onChange={(e) => onIncludedChange(e.target.checked)}
        />
        Units and sets
        {summary ? `: ${summary}` : ""}
      </label>
      {!included && <p className="text-xs text-muted-foreground">The units stay drafts, for a later deploy.</p>}
      {included && children}
    </section>
  );
}

/** What returning coders who got new units are told (`{n}`: how many); empty: nothing. */
export function NewUnitsMessage({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="block space-y-1">
      <span className="flex items-center gap-1 font-medium text-foreground">
        Coders who get new units are told
        <InfoTip label="About the new units message">
          Shown once, when a coder comes back and has units they didn&apos;t have before (you added units or moved units
          to them). {"{n}"} is how many. Leave it empty to tell them nothing. A finished session opens again for them,
          unless it has closed.
        </InfoTip>
      </span>
      <input
        aria-label="Message for coders who get new units"
        value={value}
        maxLength={500}
        placeholder="Nothing"
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-sm"
      />
    </label>
  );
}
