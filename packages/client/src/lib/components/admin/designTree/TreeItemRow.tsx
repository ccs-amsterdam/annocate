import { createElement } from "react";
import { AlertCircle, CornerDownLeft } from "lucide-react";
import { cn } from "cn";
import { useDesignTree } from "./context";
import { ITEM_TYPES, answerTypeWord } from "./itemTypes";
import { AddItemMenu, type AddOption } from "./AddItemMenu";
import { Knot, TreeRow, type Rail } from "./TreeRow";
import { getItemKey, insertableTypesAt, type TreeNode } from "./utils";
import { parseSimpleCondition, type TopLevelItem, type UnitLoopItem } from "@annotinder/contracts";
import { describeCondition, itemTitle } from "../../../codebook/conditions";
import type { TreePosition } from "../../../design/itemEdit";
import { layoutNames } from "../../../design/loopLayouts";
import { Leaf } from "@/components/Logo";
import { childrenOf, findItem, findParent, isElse, loopUnitsSummary } from "../../../codebook/tree";

/** How an item is called in menus: its title, a condition by its condition, a loop by its label. */
function rowTitle(item: TreeNode): string {
  if (item.type === "unit_loop") return treeLoopTitle(item);
  return itemTitle(item) || "(unnamed)";
}

/** A container as the add menu names it: in quotes, an else part as its branch's "otherwise". */
function levelName(items: TopLevelItem[], container: TreeNode): string {
  if (isElse(container)) {
    const branch = findParent(items, getItemKey(container));
    return `"otherwise" of ${branch ? `"${rowTitle(branch as TreeNode)}"` : "the branch"}`;
  }
  return `"${rowTitle(container)}"`;
}

/** How a position is called in the add menu: by its level ("In "Headlines"", "At the top level"). */
function positionLabel(items: TopLevelItem[], position: TreePosition): string {
  let container: TreeNode | null;
  if ("into" in position) container = position.into === null ? null : (findItem(items, position.into) as TreeNode);
  else container = findParent(items, "before" in position ? position.before : position.after) as TreeNode | null;
  return container ? `In ${levelName(items, container)}` : "At the top level";
}

/** A position's label as a move: "Move into "Headlines"", "Move to the top level". */
function moveLabel(label: string): string {
  return label.startsWith("In ") ? `Move into ${label.slice(3)}` : "Move to the top level";
}

/**
 * An item row: its lines (`rails`, a column per level), the item (click:
 * open it), a tick box (for moving and deleting several items, shown on
 * hover or while items are ticked), and a + to add an item below it (shown
 * on hover): after it, or for a loop or condition at the top of its children. While moving, the + becomes
 * "move below this item", at the same place: rows never shift.
 */
export function TreeItemRow({ item, rails }: { item: TreeNode; rails: Rail[] }) {
  const tree = useDesignTree();
  const key = getItemKey(item);
  // A loop's and a layout's knot sits on the line (the loop's own)
  const onLine = rails.at(-1) === "node" || rails.at(-1) === "root";
  const ticked = tree.isChecked(key);
  const inTicked = ticked && !tree.checked.has(key);
  const positions = tree.readOnly ? [] : tree.addPositions(key);
  // Moving: the places below this row the ticked items may go.
  const options: AddOption[] = (tree.moving ? positions.filter(tree.canMoveTo) : positions)
    .map((position) => ({
      position,
      label: positionLabel(tree.items, position),
      types: insertableTypesAt(tree.items, position),
    }))
    .filter((o) => o.types.length > 0);

  const action = tree.readOnly ? null : tree.moving ? (
    <AddItemMenu
      key="move"
      icon={CornerDownLeft}
      title="Move below this item"
      className="text-primary"
      options={options.map((o) => ({ ...o, label: moveLabel(o.label) }))}
      onAdd={() => undefined}
      onPick={tree.moveTo}
      onPreview={tree.setPreview}
    />
  ) : (
    <AddItemMenu key="add" options={options} onAdd={tree.addAt} onPreview={tree.setPreview} />
  );

  // A branch's else items: their own row, "otherwise", with the + to add inside (not selected, moved or ticked itself)
  if (isElse(item))
    return (
      <TreeRow rails={rails} actions={action} dimActions={!tree.moving}>
        <span className="pl-1 text-xs text-muted-foreground italic">otherwise</span>
      </TreeRow>
    );
  const selected = tree.selected === key;
  // A branch's +: its items ("If …"), or (none yet) its else items ("Otherwise"), then the places further out
  const branchOptions = (): AddOption[] => {
    if (item.type !== "branch") return options;
    const hasElse = (childrenOf(item) ?? []).some((c) => isElse(c) && (childrenOf(c) ?? []).length > 0);
    const [own, ...outer] = options;
    const condition = item.condition?.script.trim() ? describeCondition(item.condition) : "the condition holds";
    const inside = own ? [{ ...own, label: `If ${condition}` }] : [];
    const otherwise: AddOption[] = hasElse
      ? []
      : [
          {
            position: { into: key },
            label: "Otherwise",
            types: insertableTypesAt(tree.items, { into: key }),
            add: (type) => tree.addElse(key, type),
          },
        ];
    // An empty branch: "into" is its own place; "after" and further out follow
    return [...inside, ...otherwise, ...outer.filter((o) => !("into" in o.position))];
  };
  const rowAction =
    item.type === "branch" && !tree.readOnly && !tree.moving ? (
      <AddItemMenu key="add" options={branchOptions()} onAdd={tree.addAt} onPreview={tree.setPreview} />
    ) : (
      action
    );

  return (
    <TreeRow
      rails={rails}
      knot={onLine && <ItemKnot item={item} />}
      actions={rowAction}
      dimActions={!tree.moving}
      className={cn(
        item.type === "unit_loop" && "h-10",
        !selected && "hover:bg-muted/40",
        tree.moving && ticked && "ring-1 ring-primary/40",
      )}
    >
      <button
        type="button"
        onClick={() => tree.select(key)}
        className={cn(
          "flex min-w-0 flex-1 cursor-pointer items-center gap-1 self-stretch rounded pl-0.5 text-left",
          selected && "bg-wood/15",
        )}
      >
        <ItemLabel
          item={item}
          onLine={onLine}
          selected={selected}
          issue={tree.getIssue(item)}
          changed={tree.isChanged(item)}
        />
      </button>
      {/* Right of the item, by the +: the lines on the left stay the tree's */}
      {!tree.readOnly && (
        <input
          type="checkbox"
          aria-label={`Select ${rowTitle(item)}`}
          title={inTicked ? "Selected with the item it is in" : "Select to move or delete"}
          checked={ticked}
          disabled={inTicked || tree.moving}
          onChange={() => tree.toggleChecked(key)}
          className={cn(
            "ml-1 h-3.5 w-3.5 shrink-0 cursor-pointer accent-primary transition-opacity disabled:cursor-default",
            tree.checked.size === 0 && "opacity-0 group-hover:opacity-60 focus-visible:opacity-100",
          )}
        />
      )}
    </TreeRow>
  );
}

function ItemLabel({
  item,
  onLine,
  selected,
  issue,
  changed,
}: {
  item: TreeNode;
  /** Its knot is on the line (a loop's, a layout's in its loop): no icon here. */
  onLine: boolean;
  selected: boolean;
  issue: string | null;
  changed: boolean;
}) {
  // A branch's or loop's condition, next to its label (e.g. "Social media use · if use_social is true"); not yet set: none
  const condition =
    (item.type === "branch" || item.type === "unit_loop") && item.condition?.script.trim() ? item.condition : undefined;
  const nameClass = cn("truncate px-1 py-0.5", ITEM_TYPES[item.type].nameClass, selected && "font-semibold");
  return (
    <>
      {!onLine && <ItemIcon item={item} />}
      {item.type === "branch" ? (
        // Branches have no name: their label, else "Branch" when there's no condition yet either
        (item.label?.trim() || !condition) && <span className={nameClass}>{item.label?.trim() || "Branch"}</span>
      ) : (
        // A loop's name before its "for each unit" and units, which give way first
        <span className={cn(nameClass, item.type === "unit_loop" && "shrink-0 text-[15px]")}>
          {item.type === "unit_loop"
            ? treeLoopTitle(item)
            : item.type === "layout"
              ? item.label?.trim() || "Unit layout"
              : itemTitle(item) || <em className="font-normal text-muted-foreground">(unnamed)</em>}
        </span>
      )}
      {item.type === "unit_loop" && (
        <span className="min-w-0 truncate px-1 text-[10px] font-semibold tracking-wider text-wood uppercase">
          for each unit
        </span>
      )}
      {condition && (
        <span
          className={cn(
            "truncate px-1 text-muted-foreground",
            parseSimpleCondition(condition.script) ? "text-xs" : "font-mono text-[11px]",
          )}
          title={condition.script}
        >
          if {describeCondition(condition)}
        </span>
      )}
      {"variable" in item && item.variable?.type === "unspecified" && (
        <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
          to specify
        </span>
      )}
      {changed && (
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
      <ItemMeta item={item} />
    </>
  );
}

/** On the right of the item: a question's answer type, a layout's fields, a loop's units, an experiment's conditions. */
function ItemMeta({ item }: { item: TreeNode }) {
  const meta = "ml-auto shrink-0 pl-2 text-[11px] text-muted-foreground";
  if (item.type === "question") return <span className={meta}>{answerTypeWord(item)}</span>;
  if (item.type === "unit_loop")
    return <span className={cn(meta, "min-w-0 shrink truncate")}>{loopUnitsSummary(item)}</span>;
  if (item.type === "experiment") {
    const conditions = item.variable.options?.map((o) => o.value).join(" or ");
    return conditions ? <span className={cn(meta, "min-w-0 shrink truncate")}>{conditions}</span> : null;
  }
  if (item.type === "layout") {
    // What it shows: unit fields and answers, by their names
    const fields = layoutNames(item).shown.map((name) => name.replace(/^(unit|var)\./, ""));
    // An empty layout: the questions after it show without the unit
    if (fields.length === 0 && !item.template?.trim()) return <span className={meta}>unit not shown</span>;
    return (
      <span className="ml-auto flex min-w-0 shrink gap-1 overflow-hidden pl-2" title={fields.join(", ")}>
        {fields.map((field) => (
          <span key={field} className="shrink-0 rounded bg-wood/10 px-1.5 text-[11px] text-wood">
            {field}
          </span>
        ))}
      </span>
    );
  }
  return null;
}

/** A question is a leaf at the end of its twig; other items their type's icon; a branch none (its twig leads into its label). */
function ItemIcon({ item }: { item: TreeNode }) {
  const { label, color, icon, knotClass } = ITEM_TYPES[item.type];
  if (item.type === "branch") return null;
  if (item.type === "question") return <Leaf className={cn("shrink-0", color)} />;
  // Off its loop's line (in a branch): the knot as the icon
  if (knotClass) return <Knot icon={icon} className={cn("relative shrink-0", knotClass)} iconClass={color} />;
  return (
    <span title={label} className="shrink-0">
      {createElement(icon, { className: cn("h-4 w-4", color) })}
    </span>
  );
}

/** A loop's or layout's knot on the line. */
function ItemKnot({ item }: { item: TreeNode }) {
  const { icon, color, knotClass } = ITEM_TYPES[item.type];
  return <Knot icon={icon} className={knotClass} iconClass={color} />;
}

/**
 * A loop in the tree: its label, else just "Unit loop" (its sets show
 * next to it). Messages and exports, where loops must be told apart without
 * the tree, use the loop's id then (contracts `loopTitle`).
 */
function treeLoopTitle(loop: UnitLoopItem): string {
  return loop.label?.trim() || "Unit loop";
}
