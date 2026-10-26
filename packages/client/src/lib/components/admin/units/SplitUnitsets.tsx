import { useState } from "react";
import { splitUnits, type UnitsetResponse } from "@annotinder/contracts";
import type { AdminClient } from "../../../api/httpAdminClient";
import { useCreateUnitsetMutation } from "../../../admin/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Splits units (all, or one unitset) into `<prefix>_1..n` plus an optional
 * `<prefix>_overlap` set, e.g. for intercoder reliability. The split happens
 * here (`splitUnits`, shuffled with a seed); the db server just stores the
 * resulting unitsets. Units added to the job later are not added to them.
 */
export function SplitUnitsets({
  client,
  source,
  unitIds,
  unitsets,
  onDone,
}: {
  client: AdminClient;
  /** Name of the unitset being split; null for all units. */
  source: string | null;
  unitIds: number[];
  unitsets: UnitsetResponse[];
  onDone: () => void;
}) {
  const createUnitset = useCreateUnitsetMutation(client);
  const [prefix, setPrefix] = useState("part");
  const [parts, setParts] = useState(4);
  const [overlap, setOverlap] = useState(0);
  const [overlapIsPercent, setOverlapIsPercent] = useState(true);
  const [seed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [error, setError] = useState<string | null>(null);

  const overlapOption = overlapIsPercent ? { overlapFraction: overlap / 100 } : { overlapUnits: overlap };
  const split = splitUnits(unitIds, { parts, shuffle: true, seed, ...overlapOption });
  const sets = split.parts.map((ids, i) => ({ name: `${prefix}_${i + 1}`, unitIds: ids }));
  if (split.overlap.length > 0) sets.push({ name: `${prefix}_overlap`, unitIds: split.overlap });
  const taken = sets.find((s) => unitsets.some((u) => u.name === s.name));

  async function create() {
    setError(null);
    try {
      for (const set of sets) await createUnitset.mutateAsync(set);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4 text-sm">
      <h3 className="font-semibold">
        Split {source ? <span className="font-mono">{source}</span> : "all units"} ({unitIds.length}) into unitsets
      </h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          parts
          <Input
            type="number"
            min={1}
            className="w-20"
            value={parts}
            onChange={(e) => setParts(Math.max(1, Number(e.target.value)))}
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
          name prefix
          <Input className="w-28" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
        </label>
      </div>
      <p className="text-muted-foreground">
        Creates {sets.map((s) => `${s.name} (${s.unitIds.length})`).join(", ")}. Units are shuffled first. Route coders
        to a part in a unit loop with e.g. <code>{`${prefix}_$var.slot.code`}</code>.
      </p>
      {taken && <p className="text-destructive">A unitset named {taken.name} already exists: pick another prefix.</p>}
      {error && <p className="text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button
          onClick={() => void create()}
          disabled={!/^\w+$/.test(prefix) || unitIds.length === 0 || !!taken || createUnitset.isPending}
        >
          {createUnitset.isPending ? "Creating..." : `Create ${sets.length} unitsets`}
        </Button>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
