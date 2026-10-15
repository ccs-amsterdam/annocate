import { useState } from "react";
import type { AdminClient } from "../../api/httpAdminClient";
import {
  useCreateUnitsetMutation,
  useDeleteUnitsetMutation,
  useGenerateUnitsetsMutation,
  useUnitsetsQuery,
  useUnitsQuery,
} from "../../admin/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ALL_UNITS_UNITSET, splitUnits } from "@annotinder/contracts";

/**
 * Unitsets management (docs/client.md §7): a named selection of
 * a job's units, referenced optionally by a codebook's `unit_loop` items by name.
 * Order and randomization are configured directly in the codebook's `unit_loop`.
 */
export function UnitsetsManager({ client }: { client: AdminClient }) {
  const unitsetsQuery = useUnitsetsQuery(client);
  const unitsQuery = useUnitsQuery(client);
  const createUnitset = useCreateUnitsetMutation(client);
  const deleteUnitset = useDeleteUnitsetMutation(client);

  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [name, setName] = useState("");
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<number>>(new Set());

  function toggleUnit(id: number) {
    setSelectedUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate() {
    await createUnitset.mutateAsync({ name, unitIds: [...selectedUnitIds] });
    setCreating(false);
    setName("");
    setSelectedUnitIds(new Set());
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Unitsets</h2>
        {!creating && !generating && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setGenerating(true)}>
              Split into parts…
            </Button>
            <Button onClick={() => setCreating(true)}>+ New unitset</Button>
          </div>
        )}
      </div>

      {generating && <GenerateUnitsetsForm client={client} totalUnits={unitsQuery.data?.length ?? 0} onDone={() => setGenerating(false)} />}

      {creating && (
        <div className="flex flex-col gap-2 rounded border p-3">
          <Input placeholder="Unitset name" value={name} onChange={(e) => setName(e.target.value)} />
          <p className="text-sm font-medium">Units ({selectedUnitIds.size} selected)</p>
          <div className="max-h-48 overflow-auto rounded border">
            {(unitsQuery.data ?? []).map((unit) => (
              <label key={unit.id} className="flex items-center gap-2 border-b px-2 py-1 text-sm last:border-0">
                <input type="checkbox" checked={selectedUnitIds.has(unit.id)} onChange={() => toggleUnit(unit.id)} />
                {unit.externalId}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleCreate}
              disabled={!name || selectedUnitIds.size === 0 || createUnitset.isPending}
            >
              {createUnitset.isPending ? "Creating..." : "Create"}
            </Button>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
          {createUnitset.isError && <p className="text-sm text-destructive">{createUnitset.error.message}</p>}
        </div>
      )}

      <div className="flex flex-col gap-1">
        {(unitsetsQuery.data ?? []).map((set) => (
          <div key={set.id} className="flex items-center gap-3 rounded border px-3 py-2 text-sm">
            <span className="flex-1">
              <strong>{set.name}</strong> -- {set.unitIds.length} unit(s)
            </span>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (confirm(`Delete unitset "${set.name}"?`)) deleteUnitset.mutate(set.id);
              }}
            >
              Delete
            </Button>
          </div>
        ))}
        {deleteUnitset.isError && <p className="text-sm text-destructive">{deleteUnitset.error.message}</p>}
      </div>
    </div>
  );
}

/**
 * Splits units into `<prefix>_1..n` plus an optional `<prefix>_overlap` set
 * (e.g. for intercoder reliability). Creates ordinary unitsets: units added
 * to the job later are not added to them.
 */
function GenerateUnitsetsForm({ client, totalUnits, onDone }: { client: AdminClient; totalUnits: number; onDone: () => void }) {
  const unitsetsQuery = useUnitsetsQuery(client);
  const generate = useGenerateUnitsetsMutation(client);
  const [prefix, setPrefix] = useState("part");
  const [from, setFrom] = useState(ALL_UNITS_UNITSET);
  const [parts, setParts] = useState(4);
  const [overlap, setOverlap] = useState(0);
  const [overlapIsPercent, setOverlapIsPercent] = useState(true);

  const sourceSize =
    from === ALL_UNITS_UNITSET ? totalUnits : (unitsetsQuery.data?.find((u) => u.name === from)?.unitIds.length ?? 0);
  const overlapOption = overlapIsPercent ? { overlapFraction: overlap / 100 } : { overlapUnits: overlap };
  const preview = splitUnits(Array.from({ length: sourceSize }, (_, i) => i + 1), { parts, shuffle: false, ...overlapOption });

  async function handleGenerate() {
    await generate.mutateAsync({ prefix, from, parts, ...overlapOption });
    onDone();
  }

  return (
    <div className="flex flex-col gap-3 rounded border p-3 text-sm">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          Split
          <select
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          >
            <option value={ALL_UNITS_UNITSET}>All units</option>
            {(unitsetsQuery.data ?? []).map((u) => (
              <option key={u.id} value={u.name}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          into parts
          <Input type="number" min={1} className="w-20" value={parts} onChange={(e) => setParts(Math.max(1, Number(e.target.value)))} />
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
          name prefix
          <Input className="w-28" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
        </label>
      </div>
      <p className="text-muted-foreground">
        Creates{" "}
        {preview.parts.map((p, i) => `${prefix}_${i + 1} (${p.length})`).join(", ")}
        {preview.overlap.length > 0 && `, ${prefix}_overlap (${preview.overlap.length})`}. Units are shuffled first. Route
        coders to a part in a unit loop with e.g. <code>{`${prefix}_{slot}`}</code>.
      </p>
      <div className="flex gap-2">
        <Button onClick={handleGenerate} disabled={!prefix || sourceSize === 0 || generate.isPending}>
          {generate.isPending ? "Creating..." : "Create unitsets"}
        </Button>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {generate.isError && <p className="text-destructive">{generate.error.message}</p>}
    </div>
  );
}
