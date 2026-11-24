import { useState } from "react";
import { ROLE_COLUMNS, TEST_SET, type RoleColumn, type SetGroupResponse } from "@annotinder/contracts";
import { RotateCcw } from "lucide-react";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { usePutSetGroupMutation } from "../../../admin/queries";
import { ResetAnswersDialog, type ResetScope } from "../ResetAnswersDialog";
import { Button } from "@/components/ui/button";
import type { ShownSet } from "./SetsBar";

/** What to do with the selected units: put them in a set, remove them from the set shown, reset their answers. */
export function SelectionBar({
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
  const [group, setGroup] = useState<RoleColumn>(current?.group ?? groups[0]?.name ?? TEST_SET);
  const [setName, setSetName] = useState("");
  const sets = groups.find((g) => g.name === group)?.sets ?? [];

  /** The group's sets with `change` applied to one set (made if new). */
  const changed = (groupName: RoleColumn, name: string, change: (ids: number[]) => number[]) => {
    // A unit is in one test set: putting it in one takes it out of the others
    const existing = (groups.find((g) => g.name === groupName)?.sets ?? []).map((s) =>
      groupName === TEST_SET && s.name !== name ? { ...s, unitIds: s.unitIds.filter((id) => !selected.has(id)) } : s,
    );
    const has = existing.some((s) => s.name === name);
    const next = has
      ? existing.map((s) => (s.name === name ? { ...s, unitIds: change(s.unitIds) } : s))
      : [...existing, { name, unitIds: change([]), ordered: false }];
    return next.filter((s) => s.unitIds.length > 0);
  };
  const putIn = () => {
    const name = setName.trim();
    if (!name) return;
    putGroup.mutate(
      {
        group,
        body: { sets: changed(group, name, (ids) => [...ids, ...[...selected].filter((id) => !ids.includes(id))]) },
      },
      { onSuccess: onClear },
    );
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
          placeholder={group === TEST_SET ? "e.g. gold" : "e.g. anna or pre"}
          value={setName}
          onChange={(e) => setSetName(e.target.value)}
        />
        <datalist id="unitpage-sets">
          {(group === TEST_SET ? ["overlap", "practice", "gold"] : sets.map((s) => s.name)).map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        of
        <select
          aria-label="Group"
          className="h-9 rounded-md border border-input bg-background px-2 font-mono text-xs"
          value={group}
          onChange={(e) => setGroup(e.target.value as RoleColumn)}
        >
          {ROLE_COLUMNS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
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
              {
                group: current.group,
                body: { sets: changed(current.group, current.set, (ids) => ids.filter((id) => !selected.has(id))) },
              },
              { onSuccess: onClear },
            )
          }
        >
          Remove from {current.set}
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          setResetting({ unitIds: [...selected], label: `${selected.size} unit${selected.size === 1 ? "" : "s"}` })
        }
      >
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
