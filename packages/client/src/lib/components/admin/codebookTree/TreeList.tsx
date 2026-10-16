import { cn } from "cn";
import { TreeItemRow } from "./TreeItemRow";
import { ListEndRow } from "./ListEndRow";
import { ITEM_TYPES } from "./itemTypes";
import { getChildren, getItemKey, type TreeNode } from "./utils";

interface TreeListProps {
  nodes: TreeNode[];
  /** Container owning this list; null for the codebook root. */
  parent: TreeNode | null;
}

/** Renders a list of items (recursing into children), closed by a ListEndRow. */
export function TreeList({ nodes, parent }: TreeListProps) {
  return (
    <div className="flex flex-col">
      {nodes.map((node) => (
        <TreeNodeView key={getItemKey(node)} item={node} />
      ))}
      <ListEndRow parent={parent} />
    </div>
  );
}

/**
 * Containers render as a tinted block holding their own row, their children and
 * their end row. The block's left border doubles as the indent guide.
 */
function TreeNodeView({ item }: { item: TreeNode }) {
  const children = getChildren(item);
  if (!children) return <TreeItemRow item={item} />;

  return (
    <div className={cn("my-0.5 rounded-md", ITEM_TYPES[item.type].blockClass)}>
      <TreeItemRow item={item} />
      <div className="pl-6">
        <TreeList nodes={children} parent={item} />
      </div>
    </div>
  );
}
