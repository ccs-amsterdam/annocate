import { useState, type MouseEvent } from "react";
import { useCodebookTree } from "./context";
import { AddItemMenu } from "./AddItemMenu";
import { TreeRow } from "./TreeRow";
import { insertableTypesIn } from "./utils";
import { LucideListEnd } from "lucide-react";

/**
 * The last row of the codebook, the position after its last item (a row's
 * + inserts above it; a loop or condition adds to the end of its own
 * children). It has the same size in both modes, so entering or leaving
 * move mode never shifts the tree.
 */
export function ListEndRow() {
  const { movingKey, readOnly } = useCodebookTree();
  if (readOnly) return null;
  if (movingKey === null) return <AddAtEndRow />;
  return <MoveToEndRow />;
}

function AddAtEndRow() {
  const tree = useCodebookTree();
  return (
    <TreeRow size="normal">
      <AddItemMenu
        title="Add to the end of the codebook"
        label="add item"
        allowedTypes={insertableTypesIn(tree.items, null)}
        onAdd={(type) => tree.insertAtEnd(null, type)}
      />
    </TreeRow>
  );
}

function MoveToEndRow() {
  const tree = useCodebookTree();
  const [hovered, setHovered] = useState(false);

  // Keep the empty row so the layout stays identical to normal mode
  if (!tree.canMoveToEnd(null)) return <TreeRow size="normal" />;

  function handleClick(e: MouseEvent) {
    e.stopPropagation();
    tree.moveToEnd(null);
  }

  return (
    <TreeRow
      size="normal"
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      showInsertionLine={hovered}
      className="cursor-pointer"
    >
      <button
        type="button"
        className="flex cursor-pointer items-center gap-2.5 rounded leading-4 text-primary transition-colors hover:text-foreground"
      >
        <LucideListEnd className="m-auto h-4 w-4" />
        Move to the end
      </button>
    </TreeRow>
  );
}
