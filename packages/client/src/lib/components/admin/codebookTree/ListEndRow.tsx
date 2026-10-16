import { useState, type MouseEvent } from "react";
import { cn } from "cn";
import { useCodebookTree } from "./context";
import { AddItemMenu } from "./AddItemMenu";
import { TreeRow } from "./TreeRow";
import { getItemKey, insertableTypesIn, type TreeNode } from "./utils";
import { Icon } from "lucide-react";

interface ListEndRowProps {
  /** Container whose child list this row closes; null for the codebook root. */
  parent: TreeNode | null;
}

/**
 * The last row of every list, representing the position *after* the last item.
 * Item rows only target the position above themselves, so this row is the
 * only way to append to a list. It has the same size in both modes, so
 * entering/leaving move mode never shifts the tree.
 *
 * Inside a container the row is compact with a small "+ add" button, so it reads
 * as the bottom edge of the container's block. The root end row is the main entry
 * point (and all there is in an empty codebook), so it stays full size.
 */
export function ListEndRow({ parent }: ListEndRowProps) {
  const { movingKey } = useCodebookTree();
  if (movingKey === null) return <AddAtEndRow parent={parent} />;
  return <MoveToEndRow parent={parent} />;
}

function AddAtEndRow({ parent }: ListEndRowProps) {
  const tree = useCodebookTree();
  const parentKey = parent ? getItemKey(parent) : null;
  const containerName = parent ? parent.name || "container" : "codebook";

  return (
    <TreeRow size={"normal"}>
      <AddItemMenu
        title={`Add to end of ${containerName}`}
        label={`${containerName} item`}
        allowedTypes={insertableTypesIn(tree.items, parent)}
        onAdd={(type) => tree.insertAtEnd(parentKey, type)}
      />
    </TreeRow>
  );
}

function MoveToEndRow({ parent }: ListEndRowProps) {
  const tree = useCodebookTree();
  const [hovered, setHovered] = useState(false);
  const parentKey = parent ? getItemKey(parent) : null;
  const compact = parent !== null;
  const size = compact ? "compact" : "normal";

  // Keep the empty row so the layout stays identical to normal mode
  if (!tree.canMoveToEnd(parentKey)) return <TreeRow size={size} />;

  function handleClick(e: MouseEvent) {
    e.stopPropagation();
    tree.moveToEnd(parentKey);
  }

  return (
    <TreeRow
      size={size}
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      showInsertionLine={hovered}
      className="cursor-pointer"
    >
      <span
        className={cn(
          "rounded-md border border-dashed border-border px-2 font-medium text-muted-foreground group-hover:border-primary/60 group-hover:text-foreground",
          compact ? "py-0 text-[10px] leading-4" : "py-0.5 text-xs",
        )}
      >
        Move here
      </span>
    </TreeRow>
  );
}
