import { useState } from "react";
import type { AdminClient } from "../../api/httpAdminClient";
import {
  useCreateUnitsetMutation,
  useDeleteUnitsetMutation,
  useUnitsetsQuery,
  useUnitsQuery,
  useUpdateUnitsetMutation,
} from "../../admin/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Unitsets management (design plan §5.4/§2): a named, ordered selection of
 * a job's units, referenced by a codebook's `unit_loop` items by name.
 */
export function UnitsetsManager({ client }: { client: AdminClient }) {
  const unitsetsQuery = useUnitsetsQuery(client);
  const unitsQuery = useUnitsQuery(client);
  const createUnitset = useCreateUnitsetMutation(client);
  const updateUnitset = useUpdateUnitsetMutation(client);
  const deleteUnitset = useDeleteUnitsetMutation(client);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [order, setOrder] = useState<"fixed" | "random">("fixed");
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
    await createUnitset.mutateAsync({ name, unitIds: [...selectedUnitIds], order });
    setCreating(false);
    setName("");
    setSelectedUnitIds(new Set());
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Unitsets</h2>
        {!creating && <Button onClick={() => setCreating(true)}>+ New unitset</Button>}
      </div>

      {creating && (
        <div className="flex flex-col gap-2 rounded border p-3">
          <Input placeholder="Unitset name" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            Order:
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={order}
              onChange={(e) => setOrder(e.target.value as "fixed" | "random")}
            >
              <option value="fixed">Fixed</option>
              <option value="random">Random per coder</option>
            </select>
          </label>
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
              <strong>{set.name}</strong> -- {set.unitIds.length} unit(s), {set.order} order
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                updateUnitset.mutate({
                  id: set.id,
                  body: { name: set.name, unitIds: set.unitIds, order: set.order === "fixed" ? "random" : "fixed" },
                })
              }
            >
              Toggle order
            </Button>
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
