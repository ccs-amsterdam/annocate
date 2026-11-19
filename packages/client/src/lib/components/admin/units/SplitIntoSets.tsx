import { useState } from "react";
import { OVERLAP_SET, SetGroupNameSchema, splitIntoSets, type SetGroupResponse } from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { usePutSetGroupMutation } from "../../../admin/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HelpButton } from "../../../help/HelpButton";

/**
 * Fills a new set column (docs/architecture.md §6): splits units (all,
 * or those with one value) evenly over values `s1..sN`, or over names you
 * give (e.g. the coders, or their email addresses), plus optionally
 * `_overlap` units that every coder or group gets too (e.g. for intercoder
 * reliability). The split happens here (`splitIntoSets`, shuffled with a
 * seed); the server stores the column. Units added later get no value.
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
  /** Done: with the new group's name if it was made (null: cancelled). */
  onDone: (group: string | null) => void;
}) {
  const putGroup = usePutSetGroupMutation(client);
  const [group, setGroup] = useState(() => {
    let n = 1;
    while (groups.some((g) => g.name === (n === 1 ? "sets" : `sets${n}`))) n++;
    return n === 1 ? "sets" : `sets${n}`;
  });
  const [count, setCount] = useState(4);
  // Names for the values (one per line or comma): the coders, or groups; empty: s1..sN
  const [namesText, setNamesText] = useState("");
  const names = namesText
    .split(/[\n,]+/)
    .map((n) => n.trim())
    .filter(Boolean);
  const [overlap, setOverlap] = useState(0);
  const [overlapIsPercent, setOverlapIsPercent] = useState(true);
  const [seed] = useState(() => Math.floor(Math.random() * 1_000_000));

  const overlapOption = overlapIsPercent ? { overlapFraction: overlap / 100 } : { overlapUnits: overlap };
  const split = splitIntoSets(unitIds, { sets: names.length || count, shuffle: true, seed, ...overlapOption });
  // Named values replace s1..sN in order; the overlap keeps its name
  let i = 0;
  const sets = split.map((s) => (s.name === OVERLAP_SET || names.length === 0 ? s : { ...s, name: names[i++] }));
  const twice = names.find((n, j) => names.indexOf(n) !== j);
  const taken = groups.some((g) => g.name === group);
  const validName = SetGroupNameSchema.safeParse(group).success;

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4 text-sm">
      <h3 className="flex items-center gap-1.5 font-semibold">
        Fill a set column with {source ? <span className="font-mono">{source}</span> : "all units"} ({unitIds.length})
        <HelpButton topic="sets" label="Help: sets" />
      </h3>
      <div className="flex flex-wrap items-end gap-3">
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
        <label className="flex flex-col gap-1">
          overlap
          <div className="flex gap-1">
            <Input
              type="number"
              min={0}
              className="w-20"
              value={overlap}
              onChange={(e) => setOverlap(Math.max(0, Number(e.target.value)))}
            />
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
          column name
          <Input className="w-32 font-mono" value={group} onChange={(e) => setGroup(e.target.value)} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        names (optional): one per line, e.g. your coders or their email addresses
        <textarea
          className="min-h-16 rounded-md border border-input bg-background px-2 py-1 font-mono text-sm"
          value={namesText}
          placeholder={"anna\nbob\ncarla"}
          onChange={(e) => setNamesText(e.target.value)}
        />
      </label>
      <p className="text-muted-foreground">
        Makes column <span className="font-mono">{group}</span> with{" "}
        {sets.map((s) => `${s.name} (${s.units.length})`).join(", ")}. Units are shuffled first. {OVERLAP_SET} units are
        for everyone. To give each coder their own units, choose this column under
        <em> Coders</em> in the session settings; for groups, link a condition to it.
      </p>
      {!validName && (
        <p className="text-destructive">A column&apos;s name is letters, digits and _, starting with a letter.</p>
      )}
      {taken && <p className="text-destructive">A column named {group} already exists: pick another name.</p>}
      {twice && <p className="text-destructive">{twice} is listed twice.</p>}
      {putGroup.isError && <p className="text-destructive">{putGroup.error.message}</p>}
      <div className="flex gap-2">
        <Button
          onClick={() =>
            putGroup.mutate(
              { group, body: { sets: sets.map((s) => ({ name: s.name, unitIds: s.units, ordered: false })) } },
              { onSuccess: () => onDone(group) },
            )
          }
          disabled={!validName || unitIds.length === 0 || taken || !!twice || putGroup.isPending}
        >
          {putGroup.isPending
            ? "Creating..."
            : `Create column with ${sets.filter((s) => s.name !== OVERLAP_SET).length} values`}
        </Button>
        <Button variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
