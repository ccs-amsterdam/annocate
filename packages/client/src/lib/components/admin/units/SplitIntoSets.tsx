import { useState } from "react";
import { CONDITION_SET, PART_SET, splitIntoSets, type SetGroupResponse } from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { usePutSetGroupMutation, useUnitsQuery } from "../../../admin/queries";
import { ROLE_LABELS } from "../../../admin/setKinds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HelpButton } from "../../../help/HelpButton";

/** The role columns made by splitting units (`coder_set` has its dialog, `test_unit` the coder set dialog's redistribution). */
export type SplitColumn = typeof CONDITION_SET | typeof PART_SET;
const SPLIT_COLUMNS: SplitColumn[] = [PART_SET, CONDITION_SET];

const EXAMPLES: Record<SplitColumn, { names: string; prefix: string; use: string }> = {
  part_set: {
    names: "pre\npost",
    prefix: "part",
    use: "A unit loop shows one part (its Units settings).",
  },
  condition_set: {
    names: "control\ntreatment",
    prefix: "condition",
    use: "An experiment whose conditions get their own units uses it (its values are the conditions).",
  },
};

/**
 * Fills a part set or condition set (docs/plans/unit-sets.md): splits
 * units (all, or those of one set) evenly over values `part1..partN` (or
 * `condition1..`), or over names you give (e.g. `pre` and `post`, or the
 * conditions). The split happens here (`splitIntoSets`, shuffled with a
 * seed); the server stores the column, replacing what it had. Units added
 * later get no value.
 */
export function SplitIntoSets({
  client,
  source,
  unitIds,
  groups,
  column: fixed,
  onDone,
}: {
  client: ResearcherApi;
  /** The set being split; null for all units. */
  source: string | null;
  unitIds: number[];
  groups: SetGroupResponse[];
  /** The column to make (absent: chosen here). */
  column?: SplitColumn;
  /** Done: with the column's name if it was made (null: cancelled). */
  onDone: (group: string | null) => void;
}) {
  const putGroup = usePutSetGroupMutation(client);
  const [chosen, setChosen] = useState<SplitColumn>(fixed ?? PART_SET);
  const column = fixed ?? chosen;
  const [count, setCount] = useState(2);
  // Names for the values (one per line or comma); empty: part1..partN
  const [namesText, setNamesText] = useState("");
  const names = namesText
    .split(/[\n,;#]+/)
    .map((n) => n.trim())
    .filter(Boolean);
  const [seed] = useState(() => Math.floor(Math.random() * 1_000_000));

  const split = splitIntoSets(unitIds, {
    sets: names.length || count,
    shuffle: true,
    seed,
    prefix: EXAMPLES[column].prefix,
  });
  const sets = names.length > 0 ? split.map((s, i) => ({ ...s, name: names[i] })) : split;
  const twice = names.find((n, j) => names.indexOf(n) !== j);
  const existing = groups.find((g) => g.name === column);
  const label = ROLE_LABELS[column];

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4 text-sm">
      <h3 className="flex items-center gap-1.5 font-semibold">
        Make a {fixed ? label.toLowerCase() : "part or condition set"} of{" "}
        {source ? <span className="font-mono">{source}</span> : "all units"} ({unitIds.length})
        <HelpButton topic="sets" label="Help: sets" />
      </h3>
      <div className="flex flex-wrap items-end gap-3">
        {!fixed && (
          <label className="flex flex-col gap-1">
            column
            <select
              aria-label="Column"
              className="h-10 rounded-md border border-input bg-background px-2 text-sm"
              value={column}
              onChange={(e) => setChosen(e.target.value as SplitColumn)}
            >
              {SPLIT_COLUMNS.map((c) => (
                <option key={c} value={c}>
                  {ROLE_LABELS[c]} ({c})
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          values
          <Input
            type="number"
            min={1}
            className="w-20"
            value={names.length || count}
            disabled={names.length > 0}
            onChange={(e) => setCount(Math.max(1, Number(e.target.value)))}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        names (optional): one per line
        <textarea
          aria-label="Names"
          className="min-h-16 rounded-md border border-input bg-background px-2 py-1 font-mono text-sm"
          value={namesText}
          placeholder={EXAMPLES[column].names}
          onChange={(e) => setNamesText(e.target.value)}
        />
      </label>
      <p className="text-muted-foreground">
        Makes the {label.toLowerCase()} (<span className="font-mono">{column}</span>) with{" "}
        {sets.map((s) => `${s.name} (${s.units.length})`).join(", ")}. Units are shuffled first. {EXAMPLES[column].use}
      </p>
      {existing && (
        <p className="text-amber-700 dark:text-amber-400">
          The units have a {label.toLowerCase()} ({existing.sets.map((s) => s.name).join(", ")}): this replaces it.
        </p>
      )}
      {twice && <p className="text-destructive">{twice} is listed twice.</p>}
      {putGroup.isError && <p className="text-destructive">{putGroup.error.message}</p>}
      <div className="flex gap-2">
        <Button
          onClick={() =>
            putGroup.mutate(
              { group: column, body: { sets: sets.map((s) => ({ name: s.name, unitIds: s.units, ordered: false })) } },
              { onSuccess: () => onDone(column) },
            )
          }
          disabled={unitIds.length === 0 || !!twice || putGroup.isPending}
        >
          {putGroup.isPending
            ? "Creating..."
            : `${existing ? "Replace" : "Make"} the ${label.toLowerCase()} with ${sets.length} values`}
        </Button>
        <Button variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
      </div>
    </section>
  );
}

/** A button that opens `SplitIntoSets` for one column over all units, in a dialog (the editor's forms). */
export function MakeSetColumnButton({
  client,
  column,
  groups,
  children,
}: {
  client: ResearcherApi;
  column: SplitColumn;
  groups: SetGroupResponse[];
  children: string;
}) {
  const [open, setOpen] = useState(false);
  const units = useUnitsQuery(client).data ?? [];
  return (
    <>
      <Button type="button" variant="outline" size="sm" className="h-8 w-fit" onClick={() => setOpen(true)}>
        {children}
      </Button>
      {open && (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{ROLE_LABELS[column]}</DialogTitle>
              <DialogDescription>
                Divides the units into values of <span className="font-mono">{column}</span>. You can edit it later on
                the Units page.
              </DialogDescription>
            </DialogHeader>
            <SplitIntoSets
              client={client}
              source={null}
              unitIds={units.map((u) => u.id)}
              groups={groups}
              column={column}
              onDone={() => setOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
