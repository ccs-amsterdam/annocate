import { useState } from "react";
import { CONDITION_SET, PART_SET, splitIntoSets, type SetGroupResponse } from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { usePutSetGroupMutation, useUnitsQuery } from "../../../admin/queries";
import { ROLE_LABELS, assignWithoutValue, unitsWithoutValue } from "../../../admin/setKinds";
import { AssignModeChoice, type AssignMode } from "./AssignMode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HelpButton } from "../../../help/HelpButton";

/** The role columns made by splitting units (`coder_set` and `test_set` have their dialogs). */
export type SplitColumn = typeof CONDITION_SET | typeof PART_SET;

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
 * seed); the server stores the column, replacing what it had (after
 * asking). Or, for an existing column, the units without a value (not test
 * units) are spread over its values and the rest stays.
 */
export function SplitIntoSets({
  client,
  source,
  unitIds,
  groups,
  column,
  onDone,
}: {
  client: ResearcherApi;
  /** The set being split; null for all units. */
  source: string | null;
  unitIds: number[];
  groups: SetGroupResponse[];
  /** The column to make. */
  column: SplitColumn;
  /** Done: with the column's name if it was made (null: cancelled). */
  onDone: (group: string | null) => void;
}) {
  const putGroup = usePutSetGroupMutation(client);
  const allUnits = useUnitsQuery(client).data ?? [];
  const [count, setCount] = useState(2);
  const [mode, setMode] = useState<AssignMode>("anew");
  const [confirming, setConfirming] = useState(false);
  // Names for the values (one per line or comma); empty: part1..partN
  const [namesText, setNamesText] = useState("");
  const names = splitNames(namesText);
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
  const empty = existing
    ? unitsWithoutValue(
        allUnits.map((u) => u.id),
        groups,
        column,
      )
    : [];
  const assigning = existing !== undefined && mode === "empty";
  const values = existing?.sets.map((s) => s.name) ?? [];

  const save = () =>
    putGroup.mutate(
      {
        group: column,
        body: {
          sets: assigning
            ? assignWithoutValue(column, existing.sets, empty, { seed })
            : sets.map((s) => ({ name: s.name, unitIds: s.units, ordered: false })),
        },
      },
      { onSuccess: () => onDone(column) },
    );

  const buttonText = () => {
    if (putGroup.isPending) return "Creating...";
    if (assigning) return `Assign ${empty.length} unit${empty.length === 1 ? "" : "s"}`;
    if (confirming && existing) return "Overwrite";
    return `Make the ${label.toLowerCase()} with ${sets.length} values`;
  };

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4 text-sm">
      <h3 className="flex items-center gap-1.5 font-semibold">
        {assigning && <>Assign units without a value in the {label.toLowerCase()}</>}
        {!assigning && (
          <>
            Make a {label.toLowerCase()} of {source ? <span className="font-mono">{source}</span> : "all units"} (
            {unitIds.length})
          </>
        )}
        <HelpButton topic="sets" label="Help: sets" />
      </h3>
      {existing && <AssignModeChoice label={label.toLowerCase()} mode={mode} empty={empty.length} onChange={setMode} />}
      {assigning && (
        <p className="text-muted-foreground">
          Spreads the {empty.length} unit{empty.length === 1 ? "" : "s"} without a value evenly over {values.join(", ")}
          , at random. Current values stay.
        </p>
      )}
      {!assigning && (
        <SplitFields
          column={column}
          count={names.length || count}
          countFixed={names.length > 0}
          onCountChange={setCount}
          namesText={namesText}
          onNamesTextChange={setNamesText}
          sets={sets.map((set) => ({ name: set.name, size: set.units.length }))}
        />
      )}
      {twice && !assigning && <p className="text-destructive">{twice} is listed twice.</p>}
      {putGroup.isError && <p className="text-destructive">{putGroup.error.message}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => (existing && !assigning && !confirming ? setConfirming(true) : save())}
          disabled={(assigning ? empty.length === 0 : unitIds.length === 0 || !!twice) || putGroup.isPending}
        >
          {buttonText()}
        </Button>
        <Button variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
        {confirming && existing && !assigning && (
          <span className="text-xs text-amber-700 dark:text-amber-400">
            The {label.toLowerCase()} exists ({existing.sets.map((s) => s.name).join(", ")}): overwrite it?
          </span>
        )}
      </div>
    </section>
  );
}

/** The names typed for the values: one per line (or separated by a comma, `;` or `#`, which a name can't hold). */
function splitNames(text: string): string[] {
  return text
    .split(/[\n,;#]+/)
    .map((n) => n.trim())
    .filter(Boolean);
}

/** A new split: how many values (or their names), and what that makes. */
function SplitFields({
  column,
  count,
  countFixed,
  onCountChange,
  namesText,
  onNamesTextChange,
  sets,
}: {
  column: SplitColumn;
  count: number;
  /** Names are given: there are as many values as names. */
  countFixed: boolean;
  onCountChange: (count: number) => void;
  namesText: string;
  onNamesTextChange: (text: string) => void;
  /** The values the split makes, with how many units each gets. */
  sets: { name: string; size: number }[];
}) {
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          values
          <Input
            type="number"
            min={1}
            className="w-20"
            value={count}
            disabled={countFixed}
            onChange={(e) => onCountChange(Math.max(1, Number(e.target.value)))}
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
          onChange={(e) => onNamesTextChange(e.target.value)}
        />
      </label>
      <p className="text-muted-foreground">
        Makes the {ROLE_LABELS[column].toLowerCase()} (<span className="font-mono">{column}</span>) with{" "}
        {sets.map((set) => `${set.name} (${set.size})`).join(", ")}. Units are shuffled first. {EXAMPLES[column].use}
      </p>
    </>
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
