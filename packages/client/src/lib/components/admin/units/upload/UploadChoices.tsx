import type { RoleColumn, SetGroupResponse } from "@annotinder/contracts";
import { AlertCircle } from "lucide-react";
import type { JoinMode } from "../../../../admin/uploadUnits";
import { ROLE_LABELS } from "../../../../admin/setKinds";
import { selectClass } from "./ColumnsTable";

const plural = (n: number) => (n === 1 ? "" : "s");

/** Units of the file that already exist: replace them or not, and (after a warning) the coded ones too. */
export function ReplaceExisting({
  replaced,
  coded,
  overwrite,
  overwriteCoded,
  onOverwrite,
  onOverwriteCoded,
}: {
  /** How many units of the file the study already has, and how many of those were coded. */
  replaced: number;
  coded: number;
  overwrite: boolean;
  overwriteCoded: boolean;
  onOverwrite: (overwrite: boolean) => void;
  onOverwriteCoded: (overwriteCoded: boolean) => void;
}) {
  if (replaced === 0) return null;
  return (
    <>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={overwrite} onChange={(e) => onOverwrite(e.target.checked)} />
        Replace the {replaced} unit{plural(replaced)} that already exist
        {replaced === 1 ? "s" : ""} (same id)
      </label>
      {overwrite && coded > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-amber-500 bg-amber-500/10 p-3 text-sm">
          <p className="flex gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              {coded} of them {coded === 1 ? "was" : "were"} already coded. Replacing a coded unit harms provenance:
              later coders see other content than earlier ones. Earlier answers keep the version their coder saw (it is
              in the data download), but span annotations may no longer fit the new text.
            </span>
          </p>
          <label className="flex items-center gap-2 pl-6">
            <input type="checkbox" checked={overwriteCoded} onChange={(e) => onOverwriteCoded(e.target.checked)} />
            Also replace the {coded} coded unit{plural(coded)}
          </label>
        </div>
      )}
    </>
  );
}

/** The new units are in no set of the study's role columns: per column, whether and how they join it. */
export function JoinSets({
  added,
  groups,
  addTo,
  onChange,
}: {
  /** How many units of the file are new. */
  added: number;
  /** The role columns the file doesn't set itself. */
  groups: SetGroupResponse[];
  addTo: Record<string, "" | JoinMode>;
  onChange: (addTo: Record<string, "" | JoinMode>) => void;
}) {
  if (added === 0 || groups.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-amber-500/60 bg-amber-500/10 p-3 text-sm">
      <p>
        The {added} new unit{added === 1 ? " is" : "s are"} in no set. Add {added === 1 ? "it" : "them"} to the sets of:
      </p>
      {groups.map((g) => (
        <JoinGroup
          key={g.name}
          group={g}
          added={added}
          mode={addTo[g.name] ?? ""}
          onChange={(mode) => onChange({ ...addTo, [g.name]: mode })}
        />
      ))}
      <p className="text-[11px] text-muted-foreground">
        Shuffled first. Distributing fills the smallest sets first; new sets are named on (e.g. s5 after s4). Test units
        stay as they are. New coders get their own link if the design makes a link per coder.
      </p>
    </div>
  );
}

function JoinGroup({
  group,
  added,
  mode,
  onChange,
}: {
  group: SetGroupResponse;
  added: number;
  mode: "" | JoinMode;
  onChange: (mode: "" | JoinMode) => void;
}) {
  const sets = group.sets;
  const average = Math.max(1, Math.round(sets.reduce((n, s) => n + s.unitIds.length, 0) / sets.length));
  const newSets = Math.max(1, Math.round(added / average));
  return (
    <label className="flex flex-wrap items-center gap-2 pl-2">
      <span className="text-xs font-semibold">
        {ROLE_LABELS[group.name]} <span className="font-mono font-normal">({group.name})</span>
      </span>
      <select
        aria-label={`New units in ${group.name}`}
        className={selectClass}
        value={mode}
        onChange={(e) => onChange(e.target.value as "" | JoinMode)}
      >
        <option value="">Not in it</option>
        <option value="distribute">Distribute over its {sets.length} sets</option>
        <option value="new">
          New sets of about {average} units ({newSets} new set{plural(newSets)})
        </option>
      </select>
    </label>
  );
}

/** Uploading a role column replaces it: how many units that aren't in the file lose theirs. */
export function LosingRoles({ losing }: { losing: { group: RoleColumn; count: number }[] }) {
  if (losing.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 rounded-md border border-amber-500 bg-amber-500/10 p-3 text-sm">
      {losing.map(({ group, count }) => (
        <li key={group} className="flex gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>
            {count} unit{plural(count)} not in this file lose{count === 1 ? "s" : ""} their{" "}
            {ROLE_LABELS[group].toLowerCase()} (<span className="font-mono">{group}</span>): uploading the column
            replaces it.
          </span>
        </li>
      ))}
    </ul>
  );
}
