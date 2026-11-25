import { CornerDownLeft } from "lucide-react";
import { cn } from "cn";
import { useDesignTree } from "./context";
import { AddItemMenu, type AddOption } from "./AddItemMenu";
import { ItemKnot, ItemLabel } from "./ItemLabel";
import { moveLabel, rowTitle } from "./rowLabels";
import { TreeRow, type Rail } from "./TreeRow";
import { useRowAddOptions } from "./useRowAddOptions";
import { getItemKey, type TreeNode } from "./utils";
import { isElse } from "../../../codebook/tree";

/**
 * An item row: its lines (`rails`, a column per level), the item (click:
 * open it), a tick box (for moving and deleting several items, shown on
 * hover or while items are ticked), and a + to add an item below it (shown
 * on hover): after it, or for a loop or condition at the top of its children. While moving, the + becomes
 * "move below this item", at the same place: rows never shift.
 */
export function TreeItemRow({ item, rails }: { item: TreeNode; rails: Rail[] }) {
  const tree = useDesignTree();
  const options = useRowAddOptions(item);
  // A frozen design: no +
  const action = tree.readOnly ? null : <RowAction options={options} />;
  // A branch's else items: their own row, "otherwise", with the + to add inside (not selected, moved or ticked itself)
  if (isElse(item))
    return (
      <TreeRow rails={rails} actions={action} dimActions={!tree.moving}>
        <span className="pl-1 text-xs text-muted-foreground italic">otherwise</span>
      </TreeRow>
    );

  const key = getItemKey(item);
  // A loop's and a layout's knot sits on the line (the loop's own)
  const onLine = rails.at(-1) === "node" || rails.at(-1) === "root";
  const selected = tree.selected === key;
  return (
    <TreeRow
      rails={rails}
      knot={onLine && <ItemKnot item={item} />}
      actions={action}
      dimActions={!tree.moving}
      className={cn(
        item.type === "unit_loop" && "h-10",
        !selected && "hover:bg-muted/40",
        tree.moving && tree.isChecked(key) && "ring-1 ring-primary/40",
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
      {!tree.readOnly && <RowTickBox item={item} />}
    </TreeRow>
  );
}

/** The row's +: add an item below it, or while moving, move the ticked items there. */
function RowAction({ options }: { options: AddOption[] }) {
  const tree = useDesignTree();
  if (!tree.moving) return <AddItemMenu key="add" options={options} onAdd={tree.addAt} onPreview={tree.setPreview} />;
  return (
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
  );
}

/** Ticks the item for moving or deleting; an item inside a ticked one is ticked with it. */
function RowTickBox({ item }: { item: TreeNode }) {
  const tree = useDesignTree();
  const key = getItemKey(item);
  const ticked = tree.isChecked(key);
  const inTicked = ticked && !tree.checked.has(key);
  return (
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
  );
}
