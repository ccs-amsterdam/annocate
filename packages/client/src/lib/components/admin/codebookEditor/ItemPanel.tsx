import { useMemo, useState } from "react";
import {
  availableQuestions,
  type CodebookItem,
  type CodebookValidationIssue,
  type TopLevelItem,
  type UnitLoopItem,
} from "@annotinder/contracts";
import { AlertTriangle, Code2, Edit3, Eye } from "lucide-react";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useUnitsetsQuery } from "../../../admin/queries";
import { findParent, flattenTree, isInsideUnitLoop, itemAtPath, itemPath } from "../../../codebook/tree";
import { ItemForm } from "../ItemForm";
import { CodebookPreviewVariable } from "../CodebookPreviewVariable";
import { getItemKey } from "../codebookTree/utils";
import { SegmentedToggle } from "./SegmentedToggle";
import { ItemJsonEditor } from "./ItemJsonEditor";
import type { CodebookDraft } from "./useCodebookDraft";
import type { UnitFieldWarning } from "../../../codebook/unitFieldRefs";

type ItemPane = "edit" | "json" | "preview";

/** Right column of the visual editor: the selected item's form, its JSON, or a live preview of it. */
export function ItemPanel({
  client,
  draft,
  readOnly,
  warnings,
}: {
  client: ResearcherApi;
  draft: CodebookDraft;
  readOnly: boolean;
  warnings: UnitFieldWarning[];
}) {
  const [pane, setPane] = useState<ItemPane>("edit");
  const item = draft.selectedItem;
  const itemWarnings = item ? warnings.filter((w) => w.item === item.name) : [];

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      {item ? (
        <div className="flex h-full flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/80 bg-muted/30 p-3">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Item Type</span>
              <span className="mt-0.5 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-semibold capitalize text-foreground shadow-2xs">
                {item.type.replace("_", " ")}
              </span>
            </div>

            <SegmentedToggle
              value={pane}
              onChange={setPane}
              variant="primary"
              options={[
                { value: "edit", label: "Form", icon: Edit3 },
                { value: "json", label: "JSON", icon: Code2 },
                { value: "preview", label: "Preview", icon: Eye },
              ]}
            />
          </div>

          <div className={`flex-1 p-4 ${pane === "json" ? "flex flex-col overflow-hidden" : "overflow-y-auto"}`}>
            {itemWarnings.length > 0 && (
              <ul className="mb-3 space-y-1 rounded-md bg-amber-500/10 p-2 text-xs text-foreground">
                {itemWarnings.map((w) => (
                  <li key={w.field} className="flex gap-1.5">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    {w.message}. Check the Units tab for the fields units have.
                  </li>
                ))}
              </ul>
            )}
            {pane === "preview" ? (
              <CodebookPreviewVariable item={item} parentLoop={enclosingLoop(draft.items, item)} />
            ) : pane === "json" ? (
              <ItemJsonEditor
                key={getItemKey(item)}
                item={item}
                readOnly={readOnly}
                issues={issuesOfItem(item, draft.validationIssues, draft.cleanItems)}
                onChange={(next) => draft.update(getItemKey(item), next)}
              />
            ) : (
              <ItemEditForm client={client} draft={draft} item={item} readOnly={readOnly} />
            )}
          </div>
        </div>
      ) : (
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
          Select an item in the tree to edit properties or preview.
        </div>
      )}
    </div>
  );
}

function ItemEditForm({
  client,
  draft,
  item,
  readOnly,
}: {
  client: ResearcherApi;
  draft: CodebookDraft;
  item: CodebookItem;
  readOnly: boolean;
}) {
  const unitsetsQuery = useUnitsetsQuery(client);
  const { items, cleanItems, validationIssues } = draft;
  const key = getItemKey(item);

  const { unitVariableNames } = useMemo(() => variableNames(items), [items]);
  // What references may use at this item: the same rules as validation
  const available = useMemo(() => availableQuestions(cleanItems, itemPath(items, key) ?? []), [cleanItems, items, key]);
  const loop = enclosingLoop(items, item);
  const itemIssues = useMemo(
    () => issuesOfItem(item, validationIssues, cleanItems),
    [item, validationIssues, cleanItems],
  );

  return (
    // Disables the form's native controls; draft.update also ignores changes when read only
    <fieldset disabled={readOnly} className="contents">
      <ItemForm
        key={draft.selected ?? undefined}
        item={item}
        unitsets={unitsetsQuery.data ?? []}
        unitVariableNames={unitVariableNames}
        availableQuestions={available}
        loopConstants={loop ? Object.keys(loop.layout?.constants ?? {}) : null}
        validationIssues={itemIssues}
        isInsideLoop={isInsideUnitLoop(items, key)}
        onChange={(next) => draft.update(key, next)}
      />
    </fieldset>
  );
}

/** Names of unit-level questions (inside a loop), for references in forms. */
function variableNames(items: TopLevelItem[]) {
  const all = flattenTree(items);
  const inLoop = (i: CodebookItem) => isInsideUnitLoop(items, getItemKey(i));
  return {
    unitVariableNames: all
      .filter((i) => i.type === "unit_variable" || (i.type === "question" && inLoop(i)))
      .map((i) => i.name),
  };
}

/** The unit loop the item is in (through conditions), if any. */
function enclosingLoop(items: TopLevelItem[], item: CodebookItem): UnitLoopItem | undefined {
  let parent = findParent(items, getItemKey(item));
  while (parent) {
    if (parent.type === "unit_loop") return parent as UnitLoopItem;
    parent = findParent(items, getItemKey(parent));
  }
  return undefined;
}

/** Validation issues about this item: pointing at it by path, or (without a path to an item) mentioning it by name. */
function issuesOfItem(item: CodebookItem, issues: CodebookValidationIssue[], cleanItems: TopLevelItem[]) {
  return issues.filter((issue) => {
    const at = itemAtPath(cleanItems, issue.path);
    if (at) return at.name === item.name;
    return Boolean(item.name) && issue.message.includes(`'${item.name}'`);
  });
}
