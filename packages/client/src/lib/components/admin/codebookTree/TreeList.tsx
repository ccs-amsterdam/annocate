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

/** Renders a list of items (recursing into children). */
export function TreeList({ nodes, parent }: TreeListProps) {
  const end: TreePosition = { into: parent === null ? null : getItemKey(parent) };
  return (
    <div className="flex flex-col">
      {nodes.map((node) => (
        <TreeNodeView key={getItemKey(node)} item={node} />
      ))}
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
  const before: TreePosition = { before: getItemKey(item) };
  if (!children) {
    return (
      <>
        <PreviewLine position={before} />
        <TreeItemRow item={item} />
        <PreviewLine position={after} />
      </>
    );
  }
  return (
    <>
      <PreviewLine position={before} />
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

/** Where an add or move button will put items. */
function PreviewLine({ position }: { position: TreePosition }) {
  const { preview } = useCodebookTree();
  if (!preview.some((p) => samePosition(p, position))) return null;
  return (
    <div className="relative h-0">
      <InsertionLine />
    </div>
  );
}
