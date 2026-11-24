import { useEffect, useRef, useState } from "react";
import { useFlip } from "../../hooks/useFlip";
import { AlertCircle, CornerDownLeft, Flag, Move, Trash2, X } from "lucide-react";
import { inviteOf, sessionItem, type DesignIssue, type DesignItem, type TopLevelItem } from "@annotinder/contracts";
import {
  addPositions,
  canMoveAllTo,
  isInSelection,
  moveChanges,
  topmostSelected,
  type TreePosition,
} from "../../design/itemEdit";
import { issueIsAbout } from "../../codebook/tree";
import { Button } from "@/components/ui/button";
import { DesignTreeProvider, useDesignTree, type DesignTreeState } from "./designTree/context";
import { MainLine } from "./designTree/TreeList";
import { Knot, Rails, TreeRow } from "./designTree/TreeRow";
import { ITEM_TYPES } from "./designTree/itemTypes";
import { inviteSummary } from "./session/inviteSummary";
import { useSessionTab } from "./session/sessionTab";
import { AddItemMenu } from "./designTree/AddItemMenu";
import { getItemKey, insertableTypesAt, STUDY_END_KEY, type ItemType } from "./designTree/utils";
import { cn } from "cn";

interface DesignTreeViewProps {
  items: TopLevelItem[];
  selected: string | null;
  onSelect: (identifier: string) => void;
  onAdd: (position: TreePosition, type: ItemType) => void;
  /** A branch's else items begin (with a first question). */
  onAddElse: (branchKey: string, type: ItemType) => void;
  /** Deletes items (asking first); returns whether they were deleted. */
  onDelete: (keys: string[]) => boolean;
  onMove: (keys: string[], position: TreePosition) => void;
  validationIssues?: DesignIssue[];
  /** Keys of items with unsaved changes (marked in the tree). */
  changed?: ReadonlySet<string>;
  /** A frozen design version: items can be selected, but not added, moved or deleted. */
  readOnly?: boolean;
}

/**
 * Hierarchical view of the design items.
 *
 * - Adding: each row has a + (on hover) that adds below it. Where "below"
 *   is ambiguous (the last item of a loop: inside or after the loop; an
 *   empty loop or branch: inside or after it) its menu asks where first.
 * - Moving and deleting: tick items (a container brings its children),
 *   then Move or Delete in the toolbar. While moving, each row's + becomes
 *   "move below this item" (asking where if ambiguous, like adding), on
 *   rows where all ticked items may go; nothing else in the tree changes.
 *
 * The tree is drawn as one: a main line from the Start row (the Study
 * entry) to the "At the end" row, the items hanging off it on twigs, a
 * branch's items forking off once more, a unit loop a card on the line.
 *
 * Components (in ./designTree):
 * - TreeList     the main line, a branch's list of items, a loop's card
 * - TreeItemRow  an item row: item, tick box, +
 * - TreeRow      shared fixed-height row layout: the lines (rails), insertion line
 * - itemTypes    how each item type looks (classes to tune)
 * - AddItemMenu  "+" button: where (if ambiguous), then item type; or where to move
 */
export function DesignTreeView({
  items,
  selected,
  onSelect,
  onAdd,
  onAddElse,
  onDelete,
  onMove,
  validationIssues = [],
  changed,
  readOnly = false,
}: DesignTreeViewProps) {
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [moving, setMoving] = useState(false);
  const [preview, setPreview] = useState<TreePosition[]>([]);
  // Moved items glide to their new place
  const list = useRef<HTMLDivElement>(null);
  useFlip(list);

  // Ticked items that still exist (undo can remove them), not inside another ticked one.
  const ticked = topmostSelected(items, checked);
  const clear = () => {
    setChecked(new Set());
    setMoving(false);
  };

  useEffect(() => {
    if (!moving && checked.size === 0) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (moving) setMoving(false);
      else setChecked(new Set());
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moving, checked.size]);

  const state: DesignTreeState = {
    items,
    selected,
    readOnly,
    select: onSelect,

    checked,
    toggleChecked: (key) => {
      const next = new Set(checked);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setChecked(next);
    },
    isChecked: (key) => isInSelection(items, checked, key),

    addPositions: (key) => addPositions(items, key),
    addElse: onAddElse,
    addAt: (position, type) => {
      setPreview([]);
      onAdd(position, type);
    },

    moving,
    canMoveTo: (position) => canMoveAllTo(items, ticked, position) && moveChanges(items, ticked, position),
    moveTo: (position) => {
      onMove(ticked, position);
      setPreview([]);
      clear();
    },

    preview,
    setPreview,

    isChanged: (item) => changed?.has(getItemKey(item)) ?? false,
    getIssue: (item) => validationIssues.find((issue) => issueIsAbout(items, issue, item))?.message ?? null,
  };

  const end: TreePosition = { into: null };
  // The Study entry (always first) is the Start row, not an item
  const shown = items.filter((item) => item.type !== "session");
  const top: TreePosition | null = shown.length > 0 ? { before: getItemKey(shown[0]) } : null;
  const count = ticked.length === 1 ? "1 item" : `${ticked.length} items`;

  return (
    <DesignTreeProvider value={state}>
      {/* One bar, always there, so the tree doesn't move: Add item; with items ticked, Move and Delete; while moving, where to */}
      {!readOnly && (
        <div className="sticky top-0 z-30 flex min-h-9 flex-wrap items-center gap-2 bg-card px-1 pb-1 text-xs text-muted-foreground">
          {moving ? (
            <>
              <span className="font-medium text-primary">
                Click <CornerDownLeft className="inline h-3.5 w-3.5" /> on a row to move {count} below it
              </span>
              {top && state.canMoveTo(top) && (
                <Button size="sm" variant="outline" className="h-7" onClick={() => state.moveTo(top)}>
                  Move to the top
                </Button>
              )}
              <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={() => setMoving(false)}>
                Cancel
              </Button>
            </>
          ) : ticked.length > 0 ? (
            <>
              <span className="px-2 font-medium text-foreground">{count} selected</span>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setMoving(true)}>
                <Move className="mr-1 h-3.5 w-3.5" /> Move
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs text-destructive hover:text-destructive"
                onClick={() => onDelete(ticked) && clear()}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
              </Button>
              <Button size="sm" variant="ghost" className="ml-auto h-7" title="Clear selection (Esc)" onClick={clear}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <AddItemMenu
              label="Add item"
              options={[
                {
                  position: end,
                  label: shown.length ? "At the end" : "First item",
                  types: insertableTypesAt(items, end),
                },
                ...(top ? [{ position: top, label: "At the start", types: insertableTypesAt(items, top) }] : []),
              ]}
              onAdd={state.addAt}
              onPreview={setPreview}
            />
          )}
        </div>
      )}
      <div ref={list} className="flex flex-col px-1.5 pt-1 pb-3">
        <StartRow items={items} selected={selected} onSelect={onSelect} />
        {shown.length === 0 && !readOnly && (
          <div className="flex px-2">
            <Rails rails={["pass"]} />
            <p className="py-2 pl-1 text-sm text-muted-foreground">
              No items yet: add a unit loop (coders code units) or questions above.
            </p>
          </div>
        )}
        <MainLine items={items} />
        <StudyEndRow items={items} selected={selected === STUDY_END_KEY} onSelect={() => onSelect(STUDY_END_KEY)} />
      </div>
    </DesignTreeProvider>
  );
}

/**
 * The top of the main line, where coders come in: the Study entry (who
 * codes and how they get in; the buttons above the tree open its other
 * parts). Opens it on who codes.
 */
function StartRow({
  items,
  selected,
  onSelect,
}: {
  items: TopLevelItem[];
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  const tree = useDesignTree();
  const [, setTab] = useSessionTab();
  const session = sessionItem(items);
  if (!session) return null;
  const key = getItemKey(session as DesignItem);
  const { icon, color, knotClass, nameClass } = ITEM_TYPES.session;
  const issue = tree.getIssue(session as DesignItem);
  return (
    <TreeRow rails={["root"]} knot={<Knot icon={icon} className={cn("h-5 w-5", knotClass)} iconClass={color} />}>
      <button
        type="button"
        title="Where coders come in: who codes, and how they get in. Open to edit"
        onClick={() => {
          setTab("invite");
          onSelect(key);
        }}
        className={cn(
          "flex min-w-0 flex-1 cursor-pointer items-center gap-1 self-stretch rounded pl-1 text-left",
          selected === key ? "bg-wood/15" : "hover:bg-muted/40",
        )}
      >
        <span className={nameClass}>Start</span>
        <span
          className={cn("truncate px-1 text-[11px]", inviteOf(session) ? "text-muted-foreground" : "text-destructive")}
        >
          {inviteOf(session) ? inviteSummary(inviteOf(session)) : "who codes? Choose first"}
        </span>
        {tree.isChanged(session as DesignItem) && (
          <span
            title="Unsaved changes"
            aria-label="Unsaved changes"
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
          />
        )}
        {issue && (
          <span title={issue} className="shrink-0 text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
          </span>
        )}
      </button>
    </TreeRow>
  );
}

/**
 * The study's normal end (the Study entry's `end`), always the tree's last
 * row, where the main line ends: what coders see when they get through the
 * whole design, and where they are sent. End items in the tree are for
 * ending early.
 */
function StudyEndRow({
  items,
  selected,
  onSelect,
}: {
  items: TopLevelItem[];
  selected: boolean;
  onSelect: () => void;
}) {
  const end = sessionItem(items)?.end;
  const summary = end?.redirectSetting
    ? `then to ${end.redirectSetting}`
    : end?.redirectUrl
      ? "then to a URL"
      : end?.message
        ? "a message"
        : "the default thank-you";
  return (
    <TreeRow rails={["end"]}>
      <button
        type="button"
        onClick={onSelect}
        title="What coders see when they get through the whole design, and where they are sent"
        className={cn(
          "flex min-w-0 flex-1 cursor-pointer items-center gap-1 self-stretch rounded pl-0.5 text-left",
          selected ? "bg-wood/15" : "hover:bg-muted/40",
        )}
      >
        <Flag className="h-4 w-4 shrink-0 text-wood" />
        <span className="shrink-0 px-1 font-medium">At the end</span>
        <span className="truncate text-[11px] text-muted-foreground">· {summary}</span>
      </button>
    </TreeRow>
  );
}
