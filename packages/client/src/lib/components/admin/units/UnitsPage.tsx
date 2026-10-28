import { useMemo, useState } from "react";
import type { UnitField, UnitResponse, UnitsetResponse } from "@annotinder/contracts";
import { ChevronLeft, ChevronRight, Lock, Pencil, RotateCcw, Trash2, Upload, Scissors } from "lucide-react";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import {
  useCreateUnitsetMutation,
  useDeleteUnitMutation,
  useDeleteUnitsetMutation,
  useUnitFieldsQuery,
  useUnitPageQuery,
  useUnitQuery,
  useUnitsetsQuery,
  useUnitsQuery,
  useUpdateUnitsetMutation,
} from "../../../admin/queries";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResetAnswersDialog, type ResetScope } from "../ResetAnswersDialog";
import { Button } from "@/components/ui/button";
import { FieldBadge } from "./FieldBadge";
import { UploadUnits } from "./UploadUnits";
import { SplitUnitsets } from "./SplitUnitsets";
import { HelpButton } from "../../../help/HelpButton";

const PAGE_SIZE = 50;

/**
 * Units and unitsets in one place (docs/client.md §7): a table
 * of units with a column per field and badges for the unitsets they're in.
 * Pick a unitset to see its units in its order; select units to make a new
 * unitset, or split units into parts.
 */
export function UnitsPage({ client }: { client: ResearcherApi }) {
  const fieldsQuery = useUnitFieldsQuery(client);
  const unitsetsQuery = useUnitsetsQuery(client);
  const unitsQuery = useUnitsQuery(client);
  const [unitset, setUnitset] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [panel, setPanel] = useState<"upload" | "split" | null>(null);

  const pageQuery = useUnitPageQuery(client, { offset, limit: PAGE_SIZE, unitset: unitset ?? undefined });
  const fields = fieldsQuery.data ?? [];
  const unitsets = useMemo(() => unitsetsQuery.data ?? [], [unitsetsQuery.data]);
  const currentSet = unitsets.find((s) => s.name === unitset) ?? null;
  const total = pageQuery.data?.total ?? 0;

  // unit id -> names of the unitsets it is in
  const setsOf = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const set of unitsets) for (const id of set.unitIds) map.set(id, [...(map.get(id) ?? []), set.name]);
    return map;
  }, [unitsets]);

  function selectSet(name: string | null) {
    setUnitset(name);
    setOffset(0);
    setPanel(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-lg font-medium">
            Units <HelpButton topic="uploading-units" label="Help: units" />
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {fields.length === 0 ? (
              "No units yet: upload a CSV to start. Its columns become the units' fields."
            ) : (
              <>
                Fields:
                {fields.map((f) => (
                  <FieldBadge key={f.name} field={f} />
                ))}
              </>
            )}
          </div>
        </div>
        <Button onClick={() => setPanel(panel === "upload" ? null : "upload")} className="gap-1.5">
          <Upload className="h-4 w-4" />
          Upload CSV
        </Button>
      </header>

      {panel === "upload" && <UploadUnits client={client} jobFields={fields} onDone={() => setPanel(null)} />}

      <UnitsetBar
        client={client}
        unitsets={unitsets}
        allCount={unitsQuery.data?.length ?? 0}
        current={currentSet}
        onSelect={selectSet}
        onSplit={() => setPanel(panel === "split" ? null : "split")}
      />

      {panel === "split" && (
        <SplitUnitsets
          client={client}
          source={unitset}
          unitIds={currentSet ? currentSet.unitIds : (unitsQuery.data ?? []).map((u) => u.id)}
          unitsets={unitsets}
          onDone={() => setPanel(null)}
        />
      )}

      {selected.size > 0 && (
        <SelectionBar client={client} selected={selected} unitsets={unitsets} current={currentSet} onClear={() => setSelected(new Set())} />
      )}

      <UnitTable
        client={client}
        units={pageQuery.data?.units ?? []}
        fields={fields}
        setsOf={setsOf}
        selected={selected}
        onSelectedChange={setSelected}
        loading={pageQuery.isLoading}
      />

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
          {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(offset - PAGE_SIZE)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function UnitsetBar({
  client,
  unitsets,
  allCount,
  current,
  onSelect,
  onSplit,
}: {
  client: ResearcherApi;
  unitsets: UnitsetResponse[];
  allCount: number;
  current: UnitsetResponse | null;
  onSelect: (name: string | null) => void;
  onSplit: () => void;
}) {
  const deleteUnitset = useDeleteUnitsetMutation(client);
  const updateUnitset = useUpdateUnitsetMutation(client);
  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs transition-colors ${
      active ? "border-primary bg-primary/10 font-semibold text-foreground" : "border-border hover:border-primary/50"
    }`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={chip(current === null)} onClick={() => onSelect(null)}>
          All units <span className="text-muted-foreground">{allCount}</span>
        </button>
        {unitsets.map((set) => (
          <button key={set.id} type="button" className={chip(current?.id === set.id)} onClick={() => onSelect(set.name)}>
            <span className="font-mono">{set.name}</span> <span className="text-muted-foreground">{set.unitIds.length}</span>
          </button>
        ))}
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" variant="outline" onClick={onSplit} className="gap-1.5" disabled={allCount === 0}>
            <Scissors className="h-3.5 w-3.5" />
            Split {current ? "set" : "units"} into parts
          </Button>
          {current && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={updateUnitset.isPending}
              onClick={() => {
                const name = prompt(`Rename unitset "${current.name}" to:`, current.name)?.trim();
                if (!name || name === current.name) return;
                if (unitsets.some((s) => s.name === name)) return alert(`A unitset named ${name} already exists.`);
                updateUnitset.mutate({ id: current.id, body: { name, unitIds: current.unitIds } }, { onSuccess: () => onSelect(name) });
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
              Rename
            </Button>
          )}
          {current && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={deleteUnitset.isPending}
              onClick={() => {
                if (!confirm(`Delete unitset "${current.name}"? Its units stay.`)) return;
                deleteUnitset.mutate(current.id, { onSuccess: () => onSelect(null) });
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete set
            </Button>
          )}
        </div>
      </div>
      {current && (
        <p className="text-xs text-muted-foreground">Showing the units of {current.name} in the set&apos;s order.</p>
      )}
      {current && (
        <p className="text-[11px] text-muted-foreground">
          Renaming a set that a codebook or invitation uses changes what they hand out: codebooks name sets, so update them
          too.
        </p>
      )}
      {deleteUnitset.isError && <p className="text-sm text-destructive">{deleteUnitset.error.message}</p>}
      {updateUnitset.isError && <p className="text-sm text-destructive">{updateUnitset.error.message}</p>}
    </div>
  );
}

function SelectionBar({
  client,
  selected,
  unitsets,
  current,
  onClear,
}: {
  client: ResearcherApi;
  selected: Set<number>;
  unitsets: UnitsetResponse[];
  /** The unitset shown, if any: the selection can be removed from it. */
  current: UnitsetResponse | null;
  onClear: () => void;
}) {
  const createUnitset = useCreateUnitsetMutation(client);
  const updateUnitset = useUpdateUnitsetMutation(client);
  const [resetting, setResetting] = useState<ResetScope | null>(null);
  const addTo = (set: UnitsetResponse) =>
    updateUnitset.mutate({ id: set.id, body: { name: set.name, unitIds: [...set.unitIds, ...[...selected].filter((id) => !set.unitIds.includes(id))] } }, { onSuccess: onClear });

  function create() {
    const name = prompt(`Name for a new unitset with the ${selected.size} selected units:`)?.trim();
    if (!name) return;
    if (unitsets.some((s) => s.name === name)) return alert(`A unitset named ${name} already exists.`);
    createUnitset.mutate({ name, unitIds: [...selected] }, { onSuccess: onClear });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-primary/10 px-3 py-2 text-sm">
      <span className="font-medium">{selected.size} selected</span>
      <Button size="sm" onClick={create} disabled={createUnitset.isPending}>
        New unitset from selection
      </Button>
      {unitsets.length > 0 && (
        <select
          aria-label="Add the selection to a unitset"
          className="h-9 rounded-md border border-input bg-background px-2 text-xs"
          value=""
          disabled={updateUnitset.isPending}
          onChange={(e) => {
            const set = unitsets.find((s) => s.id === Number(e.target.value));
            if (set) addTo(set);
          }}
        >
          <option value="">Add to unitset…</option>
          {unitsets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
      {current && (
        <Button
          size="sm"
          variant="outline"
          disabled={updateUnitset.isPending}
          onClick={() =>
            updateUnitset.mutate(
              { id: current.id, body: { name: current.name, unitIds: current.unitIds.filter((id) => !selected.has(id)) } },
              { onSuccess: onClear },
            )
          }
        >
          Remove from {current.name}
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={() => setResetting({ unitIds: [...selected], label: `${selected.size} unit${selected.size === 1 ? "" : "s"}` })}>
        <RotateCcw className="h-3.5 w-3.5" /> Reset answers…
      </Button>
      <Button size="sm" variant="ghost" onClick={onClear}>
        Clear
      </Button>
      {createUnitset.isError && <span className="text-destructive">{createUnitset.error.message}</span>}
      {updateUnitset.isError && <span className="text-destructive">{updateUnitset.error.message}</span>}
      <ResetAnswersDialog client={client} scope={resetting} onClose={() => setResetting(null)} />
    </div>
  );
}

function UnitTable({
  client,
  units,
  fields,
  setsOf,
  selected,
  onSelectedChange,
  loading,
}: {
  client: ResearcherApi;
  units: UnitResponse[];
  fields: UnitField[];
  setsOf: Map<number, string[]>;
  selected: Set<number>;
  onSelectedChange: (next: Set<number>) => void;
  loading: boolean;
}) {
  const deleteUnit = useDeleteUnitMutation(client);
  const [shown, setShown] = useState<number | null>(null);
  const allOnPage = units.length > 0 && units.every((u) => selected.has(u.id));

  function toggle(ids: number[], on: boolean) {
    const next = new Set(selected);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    onSelectedChange(next);
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading units...</p>;
  if (units.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            <th className="w-8 p-2">
              <input
                type="checkbox"
                aria-label="Select all units on this page"
                checked={allOnPage}
                onChange={(e) => toggle(units.map((u) => u.id), e.target.checked)}
              />
            </th>
            <th className="p-2 font-medium">id</th>
            <th className="p-2 font-medium">Unitsets</th>
            {fields.map((f) => (
              <th key={f.name} className={`p-2 font-medium ${f.type === "text" ? "" : "text-right"}`}>
                {f.name}
              </th>
            ))}
            <th className="p-2" />
          </tr>
        </thead>
        <tbody>
          {units.map((unit) => (
            <tr key={unit.id} className="border-b align-top last:border-0">
              <td className="p-2">
                <input
                  type="checkbox"
                  aria-label={`Select ${unit.externalId}`}
                  checked={selected.has(unit.id)}
                  onChange={(e) => toggle([unit.id], e.target.checked)}
                />
              </td>
              <td className="p-2 font-mono text-xs">
                <button type="button" className="cursor-pointer text-left underline-offset-2 hover:underline" title="Show this unit" onClick={() => setShown(unit.id)}>
                  {unit.externalId}
                </button>
              </td>
              <td className="p-2">
                <div className="flex flex-wrap gap-1">
                  {(setsOf.get(unit.id) ?? []).map((name) => (
                    <span key={name} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                      {name}
                    </span>
                  ))}
                </div>
              </td>
              {fields.map((f) => (
                <FieldCell key={f.name} field={f} value={unit.data[f.name]} />
              ))}
              <td className="p-2 text-right">
                {unit.coded ? (
                  <span title="Coded: it can't be deleted; replacing it (by uploading it again) keeps what coders saw">
                    <Lock className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                ) : (
                  <button
                    type="button"
                    title="Delete unit"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => confirm(`Delete unit "${unit.externalId}"?`) && deleteUnit.mutate(unit.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {deleteUnit.isError && <p className="p-2 text-sm text-destructive">{deleteUnit.error.message}</p>}
      <UnitDialog client={client} id={shown} fields={fields} onClose={() => setShown(null)} />
    </div>
  );
}

/** One unit with all its fields in full. */
function UnitDialog({ client, id, fields, onClose }: { client: ResearcherApi; id: number | null; fields: UnitField[]; onClose: () => void }) {
  const unit = useUnitQuery(client, id).data;
  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono">{unit?.externalId ?? "…"}</DialogTitle>
          <DialogDescription>
            {unit?.coded ? "Coded: replace it by uploading it again; coders' answers keep the version they saw." : "Not coded yet."}
          </DialogDescription>
        </DialogHeader>
        {unit && (
          <dl className="flex flex-col gap-3 text-sm">
            {fields.map((f) => (
              <div key={f.name}>
                <dt className="font-mono text-xs text-muted-foreground">
                  {f.name} <span className="opacity-70">({f.type})</span>
                </dt>
                <dd className="whitespace-pre-wrap break-words">{unit.data[f.name] === null || unit.data[f.name] === undefined ? "–" : String(unit.data[f.name])}</dd>
              </div>
            ))}
          </dl>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FieldCell({ field, value }: { field: UnitField; value: UnitResponse["data"][string] | undefined }) {
  if (value === null || value === undefined || value === "") {
    return <td className="p-2 text-muted-foreground">–</td>;
  }
  if (field.type !== "text") return <td className="p-2 text-right tabular-nums">{String(value)}</td>;
  const text = String(value);
  return (
    <td className="max-w-sm p-2" title={text.length > 120 ? text : undefined}>
      <span className="line-clamp-2">{text}</span>
    </td>
  );
}
