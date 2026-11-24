import { CODER_SET, TEST_SET, type RoleColumn, type SetGroupResponse, type TestSetType } from "@annotinder/contracts";
import { Mail, Sparkles, Trash2, Users } from "lucide-react";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useDeleteSetGroupMutation } from "../../../admin/queries";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { EMAIL_COLUMN_INFO, ROLE_INFO, ROLE_LABELS, TEST_SET_INFO, isEmailColumn } from "../../../admin/setKinds";
import { HelpButton } from "../../../help/HelpButton";
import { CreateSetMenu } from "./CreateSetMenu";

/** A set (value) of a column with a role being shown. */
export interface ShownSet {
  group: RoleColumn;
  set: string;
}

const isTestSetType = (group: string, set: string): set is TestSetType => group === TEST_SET && set in TEST_SET_INFO;

/** The role columns with their values as chips: pick one to see its units; create or delete a column. */
export function SetsBar({
  client,
  groups,
  allCount,
  current,
  onSelect,
  onCreate,
  onManageCoders,
}: {
  client: ResearcherApi;
  groups: SetGroupResponse[];
  allCount: number;
  current: ShownSet | null;
  onSelect: (set: ShownSet | null) => void;
  onCreate: (column: RoleColumn) => void;
  /** Opens the coders panel (coded and left per coder, moving units). */
  onManageCoders: () => void;
}) {
  const deleteGroup = useDeleteSetGroupMutation(client);
  const chip = (active: boolean) =>
    `shrink-0 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap transition-colors ${
      active ? "border-primary bg-primary/10 font-semibold text-foreground" : "border-border hover:border-primary/50"
    }`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={chip(current === null)} onClick={() => onSelect(null)}>
          All units <span className="text-muted-foreground">{allCount}</span>
        </button>
        <div className="ml-auto flex gap-1.5">
          <CreateSetMenu disabled={allCount === 0} onCreate={onCreate} />
          <HelpButton topic="sets" label="Help: sets" />
        </div>
      </div>
      {groups.map((g) => (
        <div key={g.name} className="flex items-center gap-1.5">
          <span
            className="flex w-28 items-center gap-1 truncate text-xs font-semibold"
            title={`${g.name}: ${isEmailColumn(g) ? EMAIL_COLUMN_INFO : ROLE_INFO[g.name]}`}
          >
            {isEmailColumn(g) && <Mail className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Email addresses" />}
            <span className="truncate">{ROLE_LABELS[g.name]}</span>
          </span>
          {g.name === CODER_SET && (
            <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1 text-xs" onClick={onManageCoders}>
              <Users className="h-3.5 w-3.5" /> Coders…
            </Button>
          )}
          {/* Many values: the row scrolls */}
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-0.5">
            {g.sets.map((set) => (
              <button
                key={set.name}
                type="button"
                title={isTestSetType(g.name, set.name) ? TEST_SET_INFO[set.name] : undefined}
                className={cn(
                  chip(current?.group === g.name && current.set === set.name),
                  g.name === TEST_SET && "border-dashed italic",
                )}
                onClick={() => onSelect({ group: g.name, set: set.name })}
              >
                {g.name === TEST_SET && <Sparkles className="mr-0.5 inline h-3 w-3 text-ember" aria-hidden="true" />}
                <span className="font-mono">{set.name}</span>{" "}
                <span className="text-muted-foreground">{set.unitIds.length}</span>
              </button>
            ))}
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            title={`Delete ${g.name} (its units stay)`}
            aria-label={`Delete column ${g.name}`}
            disabled={deleteGroup.isPending}
            onClick={() => {
              if (!confirm(`Delete the ${ROLE_LABELS[g.name].toLowerCase()} (${g.name})? Its units stay.`)) return;
              deleteGroup.mutate(g.name, { onSuccess: () => current?.group === g.name && onSelect(null) });
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      {current && (
        <p className="text-xs text-muted-foreground">
          Showing the units with {current.set} in {current.group}, in their order.
        </p>
      )}
      {deleteGroup.isError && <p className="text-sm text-destructive">{deleteGroup.error.message}</p>}
    </div>
  );
}
