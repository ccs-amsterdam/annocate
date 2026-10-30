import { useMemo, useState } from "react";
import { formatSetCell, type SetGroupResponse, type UnitField, type UnitResponse } from "@annotinder/contracts";
import { ChevronLeft, ChevronRight, Lock, RotateCcw, Trash2, Upload, Scissors } from "lucide-react";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import {
  useDeleteSetGroupMutation,
  useDeleteUnitMutation,
  usePutSetGroupMutation,
  useSetGroupsQuery,
  useUnitFieldsQuery,
  useUnitPageQuery,
  useUnitQuery,
  useUnitsQuery,
} from "../../../admin/queries";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResetAnswersDialog, type ResetScope } from "../ResetAnswersDialog";
import { Button } from "@/components/ui/button";
import { FieldBadge } from "./FieldBadge";
import { UploadUnits } from "./UploadUnits";
import { SplitIntoSets } from "./SplitIntoSets";
import { HelpButton } from "../../../help/HelpButton";

const PAGE_SIZE = 50;

/** A set of a group being shown. */
interface ShownSet {
  group: string;
  set: string;
}

/**
 * Units and their sets in one place (docs/client.md §7): a table of units
 * with a column per field and a column per set group (its cell: the
 * unit's sets, as in a sets column of a CSV). Pick a set to see its units
 * in its order; select units to put them in a set, or split units into sets.
 */
export function UnitsPage({ client }: { client: ResearcherApi }) {
  const fieldsQuery = useUnitFieldsQuery(client);
  const groupsQuery = useSetGroupsQuery(client);
  const unitsQuery = useUnitsQuery(client);
  const [shownSet, setShownSet] = useState<ShownSet | null>(null);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [panel, setPanel] = useState<"upload" | "split" | null>(null);

  const pageQuery = useUnitPageQuery(client, { offset, limit: PAGE_SIZE, group: shownSet?.group, set: shownSet?.set });
  const fields = fieldsQuery.data ?? [];
  const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data]);
  const currentSet = shownSet ? groups.find((g) => g.name === shownSet.group)?.sets.find((s) => s.name === shownSet.set) ?? null : null;
  const total = pageQuery.data?.total ?? 0;

  // group -> unit id -> its cell (the unit's sets in the group)
  const cells = useMemo(() => {
    const out = new Map<string, Map<number, string>>();
    for (const g of groups) {
      const entries = new Map<number, { set: string; position?: number }[]>();
      for (const set of g.sets) {
        set.unitIds.forEach((id, i) => entries.set(id, [...(entries.get(id) ?? []), set.ordered ? { set: set.name, position: i + 1 } : { set: set.name }]));
      }
      out.set(g.name, new Map([...entries].map(([id, e]) => [id, formatSetCell(e)])));
    }
    return out;
  }, [groups]);

  function selectSet(next: ShownSet | null) {
    setShownSet(next);
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

      <SetsBar
        client={client}
        groups={groups}
        allCount={unitsQuery.data?.length ?? 0}
        current={shownSet}
        onSelect={selectSet}
        onSplit={() => setPanel(panel === "split" ? null : "split")}
      />

      {panel === "split" && (
        <SplitIntoSets
          client={client}
          source={shownSet ? `${shownSet.set} (${shownSet.group})` : null}
          unitIds={currentSet ? currentSet.unitIds : (unitsQuery.data ?? []).map((u) => u.id)}
          groups={groups}
          onDone={() => setPanel(null)}
        />
      )}

      {selected.size > 0 && (
        <SelectionBar client={client} selected={selected} groups={groups} current={shownSet} onClear={() => setSelected(new Set())} />
      )}

      <UnitTable
        client={client}
        units={pageQuery.data?.units ?? []}
        fields={fields}
        groups={groups.map((g) => g.name)}
        cells={cells}
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

function SetsBar({
  client,
  groups,
  allCount,
  current,
  onSelect,
  onSplit,
}: {
  client: ResearcherApi;
  groups: SetGroupResponse[];
  allCount: number;
  current: ShownSet | null;
  onSelect: (set: ShownSet | null) => void;
  onSplit: () => void;
}) {
  const deleteGroup = useDeleteSetGroupMutation(client);
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
        <div className="ml-auto flex gap-1.5">
          <Button size="sm" variant="outline" onClick={onSplit} className="gap-1.5" disabled={allCount === 0}>
            <Scissors className="h-3.5 w-3.5" />
            Split {current ? "set" : "units"} into sets
          </Button>
          <HelpButton topic="unitsets" label="Help: sets" />
        </div>
      </div>
      {groups.map((g) => (
        <div key={g.name} className="flex flex-wrap items-center gap-1.5">
          <span className="w-28 truncate font-mono text-xs font-semibold" title={`Group ${g.name}`}>
            {g.name}
          </span>
          {g.sets.map((set) => (
            <button
              key={set.name}
              type="button"
              className={chip(current?.group === g.name && current.set === set.name)}
              onClick={() => onSelect({ group: g.name, set: set.name })}
            >
              <span className="font-mono">{set.name}</span> <span className="text-muted-foreground">{set.unitIds.length}</span>
            </button>
          ))}
          <Button
            size="icon-sm"
            variant="ghost"
            title={`Delete group ${g.name} (its units stay)`}
            aria-label={`Delete group ${g.name}`}
            disabled={deleteGroup.isPending}
            onClick={() => {
              if (!confirm(`Delete group "${g.name}" and its sets? Its units stay.`)) return;
              deleteGroup.mutate(g.name, { onSuccess: () => current?.group === g.name && onSelect(null) });
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      {current && <p className="text-xs text-muted-foreground">Showing the units of {current.set} (group {current.group}) in the set&apos;s order.</p>}
      {deleteGroup.isError && <p className="text-sm text-destructive">{deleteGroup.error.message}</p>}
    </div>
  );
}

function SelectionBar({
  client,
  selected,
  groups,
  current,
  onClear,
}: {
  client: ResearcherApi;
  selected: Set<number>;
  groups: SetGroupResponse[];
  /** The set shown, if any: the selection can be removed from it. */
  current: ShownSet | null;
  onClear: () => void;
}) {
  const putGroup = usePutSetGroupMutation(client);
  const [resetting, setResetting] = useState<ResetScope | null>(null);
  const [group, setGroup] = useState(current?.group ?? groups[0]?.name ?? "sets");
  const [setName, setSetName] = useState("");
  const sets = groups.find((g) => g.name === group)?.sets ?? [];

  /** The group's sets with `change` applied to one set (made if new). */
  const changed = (groupName: string, name: string, change: (ids: number[]) => number[]) => {
    const existing = groups.find((g) => g.name === groupName)?.sets ?? [];
    const has = existing.some((s) => s.name === name);
    const next = has ? existing.map((s) => (s.name === name ? { ...s, unitIds: change(s.unitIds) } : s)) : [...existing, { name, unitIds: change([]), ordered: false }];
    return next.filter((s) => s.unitIds.length > 0);
  };
  const putIn = () => {
    const name = setName.trim();
    if (!name) return;
    putGroup.mutate({ group, body: { sets: changed(group, name, (ids) => [...ids, ...[...selected].filter((id) => !ids.includes(id))]) } }, { onSuccess: onClear });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-primary/10 px-3 py-2 text-sm">
      <span className="font-medium">{selected.size} selected</span>
      <span className="flex items-center gap-1.5 text-xs">
        Put in set
        <input
          aria-label="Set"
          list="unitpage-sets"
          className="h-9 w-32 rounded-md border border-input bg-background px-2 font-mono text-xs"
          placeholder="e.g. s1 or _overlap"
          value={setName}
          onChange={(e) => setSetName(e.target.value)}
        />
        <datalist id="unitpage-sets">
          {sets.map((s) => (
            <option key={s.name} value={s.name} />
          ))}
        </datalist>
        of group
        <input
          aria-label="Group"
          list="unitpage-groups"
          className="h-9 w-28 rounded-md border border-input bg-background px-2 font-mono text-xs"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
        />
        <datalist id="unitpage-groups">
          {groups.map((g) => (
            <option key={g.name} value={g.name} />
          ))}
        </datalist>
        <Button size="sm" onClick={putIn} disabled={!setName.trim() || !group || putGroup.isPending}>
          Put in
        </Button>
      </span>
      {current && (
        <Button
          size="sm"
          variant="outline"
          disabled={putGroup.isPending}
          onClick={() =>
            putGroup.mutate(
              { group: current.group, body: { sets: changed(current.group, current.set, (ids) => ids.filter((id) => !selected.has(id))) } },
              { onSuccess: onClear },
            )
          }
        >
          Remove from {current.set}
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={() => setResetting({ unitIds: [...selected], label: `${selected.size} unit${selected.size === 1 ? "" : "s"}` })}>
        <RotateCcw className="h-3.5 w-3.5" /> Reset answers…
      </Button>
      <Button size="sm" variant="ghost" onClick={onClear}>
        Clear
      </Button>
      {putGroup.isError && <span className="text-destructive">{putGroup.error.message}</span>}
      <ResetAnswersDialog client={client} scope={resetting} onClose={() => setResetting(null)} />
    </div>
  );
}

function UnitTable({
  client,
  units,
  fields,
  groups,
  cells,
  selected,
  onSelectedChange,
  loading,
}: {
  client: ResearcherApi;
  units: UnitResponse[];
  fields: UnitField[];
  /** The set groups: a column each. */
  groups: string[];
  /** group -> unit id -> the unit's sets in it (a cell as in a CSV). */
  cells: Map<string, Map<number, string>>;
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
            {groups.map((g) => (
              <th key={g} className="p-2 font-medium" title="Set group">
                <span className="font-mono">{g}</span>
              </th>
            ))}
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
              {groups.map((g) => (
                <td key={g} className="p-2 font-mono text-[11px] text-muted-foreground">
                  {cells.get(g)?.get(unit.id) ?? ""}
                </td>
              ))}
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
