import { Fragment } from "react";
import { cn } from "cn";
import type { TreePosition } from "../../../codebook/codebookEdit";
import { TreeItemRow } from "./TreeItemRow";
import { ITEM_TYPES } from "./itemTypes";
import { InsertionLine } from "./TreeRow";
import { samePosition, useCodebookTree } from "./context";
import { getChildren, getItemKey, type TreeNode } from "./utils";

interface TreeListProps {
  nodes: TreeNode[];
  /** Container owning this list; null for the codebook root. */
  parent: TreeNode | null;
}

/**
 * Renders a list of items (recursing into children). While moving, a
 * "move here" slot shows at every place the ticked items may go: before
 * each item and at the end of each list.
 */
export function TreeList({ nodes, parent }: TreeListProps) {
  const end: TreePosition = { into: parent === null ? null : getItemKey(parent) };
  return (
    <div className="flex flex-col">
      {nodes.map((node) => (
        <Fragment key={getItemKey(node)}>
          <MoveSlot position={{ before: getItemKey(node) }} />
          <TreeNodeView item={node} />
        </Fragment>
      ))}
      <MoveSlot position={end} />
      <PreviewLine position={end} />
    </div>
  );
}

/**
 * Containers render as a tinted block holding their own row and their
 * children. The block's left border doubles as the indent guide.
 */
function TreeNodeView({ item }: { item: TreeNode }) {
  const children = getChildren(item);
  const after: TreePosition = { after: getItemKey(item) };
  if (!children) {
    return (
      <>
        <TreeItemRow item={item} />
        <PreviewLine position={after} />
      </>
    );
  }
  return (
    <>
      <div className={cn("my-0.5 rounded-md pb-1", ITEM_TYPES[item.type].blockClass)}>
        <TreeItemRow item={item} />
        <div className="pl-6">
          <TreeList nodes={children} parent={item} />
        </div>
      </div>
      <PreviewLine position={after} />
    </>
  );
}

/** Where the open add menu will put the new item. */
function PreviewLine({ position }: { position: TreePosition }) {
  const { preview } = useCodebookTree();
  if (!samePosition(preview, position)) return null;
  return (
    <div className="relative h-0">
      <InsertionLine />
    </div>
  );
}

/** A place the ticked items can move to (only while moving, only where they may go). */
function MoveSlot({ position }: { position: TreePosition }) {
  const tree = useCodebookTree();
  if (!tree.moving || !tree.canMoveTo(position)) return null;
  return (
    <button
      type="button"
      onClick={() => tree.moveTo(position)}
      className="group/slot flex h-5 w-full cursor-pointer items-center gap-2 px-2"
    >
      <span className="h-px flex-1 border-t border-dashed border-primary/40 group-hover/slot:border-solid group-hover/slot:border-primary" />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/60 group-hover/slot:text-primary">
        Move here
      </span>
      <span className="h-px flex-1 border-t border-dashed border-primary/40 group-hover/slot:border-solid group-hover/slot:border-primary" />
    </button>
  );
}
