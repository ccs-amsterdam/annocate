import { useMemo, useState } from "react";
import { CODER_SET, CONDITION_SET, PART_SET, TEST_SET, isSetType, type RoleColumn } from "@annotinder/contracts";
import { Upload } from "lucide-react";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useSetGroupsQuery, useUnitFieldsQuery, useUnitPageQuery, useUnitsQuery } from "../../../admin/queries";
import { Button } from "@/components/ui/button";
import { FieldsPanel } from "./FieldsPanel";
import { UploadUnits } from "./upload/UploadUnits";
import { SplitIntoSets, type SplitColumn } from "./SplitIntoSets";
import { TestSetDialog } from "./TestSetDialog";
import { CoderSetDialog } from "../session/CoderSetDialog";
import { CodersDialog } from "./CodersDialog";
import { HelpButton } from "../../../help/HelpButton";
import { clampOffset, existingSelection, roleCells } from "../../../admin/unitsTable";
import { Pager } from "./Pager";
import { SetsBar, type ShownSet } from "./SetsBar";
import { SelectionBar } from "./SelectionBar";
import { UnitTable } from "./UnitTable";

const PAGE_SIZE = 50;

/**
 * Units and their columns with a role in one place (docs/client.md §7,
 * docs/plans/unit-sets.md): a table of units with a column per field and
 * per role column (coder set, condition set, part set, test set; its cell
 * as in a CSV). Pick a value to see its units in its order; select units to
 * put them in a set, or create a role column ("Create special set": the
 * coder set dialog, a split into a part or condition set, a test set).
 */
export function UnitsPage({ client }: { client: ResearcherApi }) {
  const fieldsQuery = useUnitFieldsQuery(client);
  const groupsQuery = useSetGroupsQuery(client);
  const unitsQuery = useUnitsQuery(client);
  const [shownSet, setShownSet] = useState<ShownSet | null>(null);
  const [offset, setOffset] = useState(0);
  const [everSelected, setSelected] = useState<Set<number>>(new Set());
  // A deleted unit is no longer selected
  const selected = useMemo(
    () =>
      unitsQuery.data
        ? existingSelection(
            everSelected,
            unitsQuery.data.map((u) => u.id),
          )
        : everSelected,
    [everSelected, unitsQuery.data],
  );
  const [panel, setPanel] = useState<"upload" | "coders" | RoleColumn | null>(null);

  const pageQuery = useUnitPageQuery(client, { offset, limit: PAGE_SIZE, group: shownSet?.group, set: shownSet?.set });
  const fields = fieldsQuery.data ?? [];
  const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data]);
  const currentSet = shownSet
    ? (groups.find((g) => g.name === shownSet.group)?.sets.find((s) => s.name === shownSet.set) ?? null)
    : null;
  const total = pageQuery.data?.total ?? 0;
  // The last page's units were deleted: show the page that is the last one now
  if (pageQuery.data && !pageQuery.isPlaceholderData && offset !== clampOffset(offset, total, PAGE_SIZE))
    setOffset(clampOffset(offset, total, PAGE_SIZE));
  const coderGroup = groups.find((g) => g.name === CODER_SET);

  const cells = useMemo(() => roleCells(groups), [groups]);

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
          <div className="mt-1">
            {fields.length === 0 && (unitsQuery.data?.length ?? 0) === 0 ? (
              <p className="text-xs text-muted-foreground">
                No units yet: upload a CSV to start. Its columns become the units' fields.
              </p>
            ) : (
              <FieldsPanel client={client} fields={fields} />
            )}
          </div>
        </div>
        <Button
          data-guide="upload-units"
          onClick={() => setPanel(panel === "upload" ? null : "upload")}
          className="gap-1.5"
        >
          <Upload className="h-4 w-4" />
          Upload CSV
        </Button>
      </header>

      {panel === "upload" && <UploadUnits client={client} studyFields={fields} onDone={() => setPanel(null)} />}

      <SetsBar
        client={client}
        groups={groups}
        allCount={unitsQuery.data?.length ?? 0}
        current={shownSet}
        onSelect={selectSet}
        onCreate={setPanel}
        onManageCoders={() => setPanel(panel === "coders" ? null : "coders")}
      />
      {panel === "coders" && coderGroup && (
        <CodersDialog client={client} groups={groups} onClose={() => setPanel(null)} />
      )}

      {(panel === CONDITION_SET || panel === PART_SET) && (
        <SplitIntoSets
          key={panel}
          client={client}
          source={shownSet ? `${shownSet.set} (${shownSet.group})` : null}
          unitIds={currentSet ? currentSet.unitIds : (unitsQuery.data ?? []).map((u) => u.id)}
          groups={groups}
          column={panel satisfies SplitColumn}
          onDone={() => setPanel(null)}
        />
      )}
      {panel === CODER_SET && <CoderSetDialog client={client} groups={groups} onDone={() => setPanel(null)} />}
      {panel === TEST_SET && <TestSetDialog client={client} groups={groups} onDone={() => setPanel(null)} />}

      {selected.size > 0 && (
        <SelectionBar
          client={client}
          selected={selected}
          groups={groups}
          current={shownSet}
          onClear={() => setSelected(new Set())}
        />
      )}

      <UnitTable
        client={client}
        units={pageQuery.data?.units ?? []}
        // Role columns show as their own columns (their cells), not again as fields
        fields={fields.filter((f) => !isSetType(f.type))}
        groups={groups.map((g) => g.name)}
        cells={cells}
        selected={selected}
        onSelectedChange={setSelected}
        loading={pageQuery.isLoading}
      />

      <Pager offset={offset} total={total} pageSize={PAGE_SIZE} onOffsetChange={setOffset} />
    </div>
  );
}
