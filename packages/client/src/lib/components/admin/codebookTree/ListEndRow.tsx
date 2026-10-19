import { useState, type MouseEvent } from "react";
import { cn } from "cn";
import { useCodebookTree } from "./context";
import { AddItemMenu } from "./AddItemMenu";
import { TreeRow } from "./TreeRow";
import { getItemKey, insertableTypesIn, type TreeNode } from "./utils";
import { Icon, LucideListEnd } from "lucide-react";

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
  const { movingKey, readOnly } = useCodebookTree();
  if (readOnly) return null;
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
        label={`add ${containerName} item`}
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

  // Keep the empty row so the layout stays identical to normal mode
  if (!tree.canMoveToEnd(parentKey)) return <TreeRow size="normal" />;

  function handleClick(e: MouseEvent) {
    e.stopPropagation();
    tree.moveToEnd(parentKey);
  }

  return (
    <TreeRow
      size='normal'
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      showInsertionLine={hovered}
      className="cursor-pointer"
    >

      <button
        type="button"
        className={cn(
          "flex cursor-pointer items-center gap-2.5 rounded leading-4 text-muted-foreground/60 transition-colors hover:text-foreground",
          "text-foreground ",
        )}
      >
        <LucideListEnd className="h-4 w-4 m-auto" />
        Move here
      </button>
    </TreeRow>
  );
}
