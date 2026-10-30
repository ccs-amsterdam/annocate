import { useState } from "react";
import { OVERLAP_SET, SetGroupNameSchema, splitIntoSets, type SetGroupResponse } from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { usePutSetGroupMutation } from "../../../admin/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HelpButton } from "../../../help/HelpButton";

/**
 * Splits units (all, or one set) into a new group of sets `s1..sN`, plus
 * optionally `_overlap` units every coder of the group codes too (e.g. for
 * intercoder reliability). The split happens here (`splitIntoSets`,
 * shuffled with a seed); the server just stores the group. Units added to
 * the job later are not added to it.
 */
export function SplitIntoSets({
  client,
  source,
  unitIds,
  groups,
  onDone,
}: {
  client: ResearcherApi;
  /** The set being split; null for all units. */
  source: string | null;
  unitIds: number[];
  groups: SetGroupResponse[];
  onDone: () => void;
}) {
  const putGroup = usePutSetGroupMutation(client);
  const [group, setGroup] = useState(() => {
    let n = 1;
    while (groups.some((g) => g.name === (n === 1 ? "sets" : `sets${n}`))) n++;
    return n === 1 ? "sets" : `sets${n}`;
  });
  const [count, setCount] = useState(4);
  const [overlap, setOverlap] = useState(0);
  const [overlapIsPercent, setOverlapIsPercent] = useState(true);
  const [seed] = useState(() => Math.floor(Math.random() * 1_000_000));

  const overlapOption = overlapIsPercent ? { overlapFraction: overlap / 100 } : { overlapUnits: overlap };
  const sets = splitIntoSets(unitIds, { sets: count, shuffle: true, seed, ...overlapOption });
  const taken = groups.some((g) => g.name === group);
  const validName = SetGroupNameSchema.safeParse(group).success;

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4 text-sm">
      <h3 className="flex items-center gap-1.5 font-semibold">
        Split {source ? <span className="font-mono">{source}</span> : "all units"} ({unitIds.length}) into sets
        <HelpButton topic="unitsets" label="Help: sets" />
      </h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          sets
          <Input type="number" min={1} className="w-20" value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value)))} />
        </label>
        <label className="flex flex-col gap-1">
          overlap
          <div className="flex gap-1">
            <Input type="number" min={0} className="w-20" value={overlap} onChange={(e) => setOverlap(Math.max(0, Number(e.target.value)))} />
            <select
              className="h-10 rounded-md border border-input bg-background px-2 text-sm"
              value={overlapIsPercent ? "pct" : "n"}
              onChange={(e) => setOverlapIsPercent(e.target.value === "pct")}
            >
              <option value="pct">%</option>
              <option value="n">units</option>
            </select>
          </div>
        </label>
        <label className="flex flex-col gap-1">
          group name
          <Input className="w-32 font-mono" value={group} onChange={(e) => setGroup(e.target.value)} />
        </label>
      </div>
      <p className="text-muted-foreground">
        Makes group <span className="font-mono">{group}</span> with {sets.map((s) => `${s.name} (${s.units.length})`).join(", ")}. Units
        are shuffled first. The {OVERLAP_SET} units are not in any other set: a loop that assigns sets of this group can give them to
        every coder too (first, last or spread). To give each coder a set, use the group in a unit loop with <em>Assign sets</em>.
      </p>
      {!validName && <p className="text-destructive">A group&apos;s name is letters, digits and _, starting with a letter.</p>}
      {taken && <p className="text-destructive">A group named {group} already exists: pick another name.</p>}
      {putGroup.isError && <p className="text-destructive">{putGroup.error.message}</p>}
      <div className="flex gap-2">
        <Button
          onClick={() =>
            putGroup.mutate(
              { group, body: { sets: sets.map((s) => ({ name: s.name, unitIds: s.units, ordered: false })) } },
              { onSuccess: onDone },
            )
          }
          disabled={!validName || unitIds.length === 0 || taken || putGroup.isPending}
        >
          {putGroup.isPending ? "Creating..." : `Create group with ${sets.length} sets`}
        </Button>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
