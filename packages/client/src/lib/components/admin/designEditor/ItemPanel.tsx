import { useMemo, useState } from "react";
import {
  sessionNames,
  splitDesignItems,
  collectQuestions,
  availableQuestions,
  itemName,
  sessionItem,
  unitLoops,
  loopTitle,
  inviteOf,
  type DesignItem,
  type EndItem,
} from "@annotinder/contracts";
import { AlertTriangle, ArrowLeft, Code2, Edit3, Eye } from "lucide-react";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useSetGroupsQuery, useUnitFieldsQuery } from "../../../admin/queries";
import { enclosingLoop, flattenTree, issueIsAbout, itemPath } from "../../../codebook/tree";
import { itemTitle } from "../../../codebook/conditions";
import { ItemForm } from "../ItemForm";
import { EndItemFields } from "../itemForm/EndItemFields";
import { Button } from "@/components/ui/button";
import { ItemPreview } from "./ItemPreview";
import { getItemKey, STUDY_END_KEY } from "../designTree/utils";
import { HelpButton } from "../../../help/HelpButton";
import { ITEM_TYPES } from "../designTree/itemTypes";
import { SegmentedToggle } from "./SegmentedToggle";
import { shareSources, type LoopUnitsContext } from "../../../design/assignment";
import { ItemJsonEditor } from "./ItemJsonEditor";
import { SessionPartJson } from "../session/SessionPartJson";
import { SessionPreview } from "../session/SessionPreview";
import { SESSION_PART_LABELS, useSessionTab } from "../session/sessionTab";
import type { DesignDraft } from "./useDesignDraft";
import type { UnitFieldWarning } from "../../../design/unitFieldRefs";
import { savedLoop, shownByLayouts } from "../../../design/loopLayouts";

type ItemPane = "edit" | "json" | "preview";

/** Right column of the visual editor: the selected item's form, its JSON, or a live preview of it. */
export function ItemPanel({
  client,
  draft,
  readOnly,
  warnings,
  previewBeside = false,
  onBack,
}: {
  client: ResearcherApi;
  draft: DesignDraft;
  readOnly: boolean;
  warnings: UnitFieldWarning[];
  /** The preview has its own column (wide screens): no Preview pane here. */
  previewBeside?: boolean;
  /** Narrow screens: back to the tree (the panes are shown one at a time). */
  onBack?: () => void;
}) {
  const [chosenPane, setPane] = useState<ItemPane>("edit");
  const [sessionPart] = useSessionTab();
  const groupsQuery = useSetGroupsQuery(client);
  const pane: ItemPane = previewBeside && chosenPane === "preview" ? "edit" : chosenPane;
  const item = draft.selectedItem;
  const itemWarnings = item ? warnings.filter((w) => w.item === itemTitle(item)) : [];

  if (draft.selected === STUDY_END_KEY) return <StudyEndPanel draft={draft} readOnly={readOnly} onBack={onBack} />;

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      {item ? (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-border/80 bg-muted/30 px-3 py-1.5">
            {onBack && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-2 h-7 gap-1 px-2"
                onClick={onBack}
                aria-label="Back to the items"
              >
                <ArrowLeft className="h-4 w-4" />
                Items
              </Button>
            )}
            <span
              className="inline-flex items-center rounded-md border border-border bg-background px-2 py-0.5 text-xs font-semibold text-foreground shadow-2xs"
              title="Item type"
            >
              {item.type === "session" ? SESSION_PART_LABELS[sessionPart] : (ITEM_TYPES[item.type]?.label ?? item.type)}
            </span>

            <SegmentedToggle
              value={pane}
              onChange={setPane}
              variant="primary"
              options={[
                { value: "edit", label: "Form", icon: Edit3 },
                { value: "json", label: "JSON", icon: Code2 },
                ...(previewBeside ? [] : [{ value: "preview" as const, label: "Preview", icon: Eye }]),
              ]}
            />
          </div>

          <div
            className={`min-h-0 flex-1 p-4 ${pane === "json" ? "flex flex-col overflow-hidden" : "overflow-y-auto"}`}
          >
            {itemWarnings.length > 0 && (
              <ul className="mb-3 space-y-1 rounded-md bg-amber-500/10 p-2 text-xs text-foreground">
                {itemWarnings.map((w) => (
                  <li key={w.field} className="flex gap-1.5">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    {w.message}. Check the Units page for the fields units have.
                  </li>
                ))}
              </ul>
            )}
            {pane === "preview" && item.type === "session" ? (
              <SessionPreview item={item} part={sessionPart} groups={groupsQuery.data ?? []} studyId={client.studyId} />
            ) : pane === "preview" ? (
              <ItemPreview key={getItemKey(item)} client={client} draft={draft} item={item} />
            ) : pane === "json" && item.type === "session" ? (
              <SessionPartJson
                item={item}
                part={sessionPart}
                readOnly={readOnly}
                issues={draft.validationIssues.filter((i) => i.path[0] === 0 && i.path[1] === sessionPart)}
                onChange={(next) => draft.update(getItemKey(item), next)}
              />
            ) : pane === "json" ? (
              <ItemJsonEditor
                key={getItemKey(item)}
                item={item}
                readOnly={readOnly}
                issues={draft.validationIssues.filter((issue) => issueIsAbout(draft.items, issue, item))}
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

/** The names of the design's end items that screen out, anywhere in it. */
function screenoutEnds(items: DesignItem[]): string[] {
  return flattenTree(items).flatMap((i) => (i.type === "end" && i.outcome === "screenout" ? [i.name] : []));
}

/** The selected item's form, with what it needs from the rest of the design. */
function ItemEditForm({
  client,
  draft,
  item,
  readOnly,
}: {
  client: ResearcherApi;
  draft: DesignDraft;
  item: DesignItem;
  readOnly: boolean;
}) {
  const groupsQuery = useSetGroupsQuery(client);
  const unitFieldsQuery = useUnitFieldsQuery(client);
  const { items, cleanItems, validationIssues } = draft;
  const key = getItemKey(item);

  // What references may use at this item: the same rules as validation
  const available = useMemo(() => availableQuestions(cleanItems, itemPath(items, key) ?? []), [cleanItems, items, key]);
  const loop = enclosingLoop(items, item);
  // The loop as saved: its layout items follow the flow there (blocks' else items as elseChildren)
  const saved = useMemo(() => (loop ? savedLoop(items, cleanItems, loop) : undefined), [items, cleanItems, loop]);
  const name = itemName(item);
  const itemIssues = useMemo(
    () => validationIssues.filter((issue) => issueIsAbout(items, issue, item)),
    [item, validationIssues, items],
  );

  return (
    // Disables the form's native controls; draft.update also ignores changes when read only
    <fieldset disabled={readOnly} className="contents">
      <ItemForm
        key={draft.selected ?? undefined}
        item={item}
        client={readOnly ? undefined : client}
        groups={groupsQuery.data ?? []}
        sessionValueNames={sessionNames(cleanItems)}
        availableQuestions={available}
        inLoop={!!loop}
        loopItems={(saved?.children ?? []) as DesignItem[]}
        unitFields={(unitFieldsQuery.data ?? []).map((f) => f.name)}
        loopNames={saved && name ? shownByLayouts(saved, name) : undefined}
        readOnly={readOnly}
        validationIssues={itemIssues}
        screenouts={item.type === "unit_loop" ? screenoutEnds(cleanItems) : undefined}
        unitsContext={item.type === "unit_loop" ? loopUnitsContext(items, cleanItems, key) : undefined}
        urlParams={sessionItem(cleanItems)?.urlParams}
        onChange={(next) => draft.update(key, next)}
      />
    </fieldset>
  );
}

/** The preview's own column on wide screens (DesignEditor). */
export function PreviewPanel({ client, draft }: { client: ResearcherApi; draft: DesignDraft }) {
  const item = draft.selectedItem;
  const [sessionPart] = useSessionTab();
  const groupsQuery = useSetGroupsQuery(client);
  return (
    <div className="flex min-h-0 flex-col overflow-hidden">
      {item?.type === "session" ? (
        <div className="overflow-y-auto rounded-xl border border-border bg-card p-4">
          <SessionPreview item={item} part={sessionPart} groups={groupsQuery.data ?? []} studyId={client.studyId} />
        </div>
      ) : item ? (
        <ItemPreview key={getItemKey(item)} client={client} draft={draft} item={item} />
      ) : (
        <div className="flex h-full items-center justify-center rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Select an item to preview it.
        </div>
      )}
    </div>
  );
}

/**
 * What a loop's Units settings need of the design (`LoopUnitsContext`): the
 * coder unit assignment, what selects a session's units (its coder, the
 * experiment that selects units), and the loops before this one.
 */
function loopUnitsContext(items: readonly DesignItem[], cleanItems: readonly unknown[], key: string): LoopUnitsContext {
  const { session, items: rest } = splitDesignItems(cleanItems);
  const random = [...collectQuestions(rest as DesignItem[]).questions]
    .filter(([, v]) => v.type === "random")
    .map(([name, v]) => ({ name, units: (v as { units?: boolean }).units === true }));
  const loops = unitLoops(items);
  const at = loops.findIndex((l) => getItemKey(l.loop as DesignItem) === key);
  return {
    invite: inviteOf(sessionItem(cleanItems)),
    sources: shareSources(session.invite, random),
    earlier: loops.slice(0, Math.max(0, at)).map((l) => ({ number: Number(l.key), title: loopTitle(l.loop, l.key) })),
  };
}

/**
 * The study's normal end (the Study entry's `end`): what coders see when
 * they get through the whole design, and where they are sent (e.g. a
 * panel's return link). Edited with an end item's fields, without its
 * outcome (always complete).
 */
function StudyEndPanel({ draft, readOnly, onBack }: { draft: DesignDraft; readOnly: boolean; onBack?: () => void }) {
  const end = sessionItem(draft.items)?.end ?? {};
  const studyIndex = draft.items.findIndex((i) => i.type === "session");
  const issues = draft.validationIssues
    .filter((i) => i.path[0] === studyIndex && i.path[1] === "end")
    .map((i) => ({ ...i, path: i.path.slice(2) }));
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <div className="flex items-center gap-2 border-b border-border/80 bg-muted/30 px-3 py-1.5">
        {onBack && (
          <Button type="button" variant="ghost" size="sm" className="-ml-2 h-7 gap-1 px-2" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Items
          </Button>
        )}
        <span className="inline-flex items-center rounded-md border border-border bg-background px-2 py-0.5 text-xs font-semibold shadow-2xs">
          At the end
        </span>
        <HelpButton topic="end-items" label="Help: the end of the study" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <p className="mb-3 text-sm text-muted-foreground">
          What coders see when they get through the whole study, and where they go next. To end a session early (a
          screen-out, a full quota), add an End item where it should happen.
        </p>
        <fieldset disabled={readOnly} className="contents">
          <EndItemFields
            studyEnd
            item={{ type: "end", name: "_end", outcome: "complete", ...end }}
            issues={issues}
            onChange={(next) => {
              const { message, redirectUrl, redirectSetting } = next as EndItem;
              const updated = {
                ...(message ? { message } : {}),
                ...(redirectUrl !== undefined ? { redirectUrl } : {}),
                ...(redirectSetting !== undefined ? { redirectSetting } : {}),
              };
              draft.setStudyEnd(Object.keys(updated).length > 0 ? updated : undefined);
            }}
          />
        </fieldset>
      </div>
    </div>
  );
}
