import { cn } from "cn";
import type { TopLevelItem } from "@annotinder/contracts";
import type { TreePosition } from "../../../design/itemEdit";
import { TreeItemRow } from "./TreeItemRow";
import { ITEM_TYPES } from "./itemTypes";
import { InsertionLine } from "./TreeRow";
import { samePosition, useDesignTree } from "./context";
import { getChildren, getItemKey, type TreeNode } from "./utils";

/** A top-level block (a unit loop, a questions block) as a light card: the header row, its items one step in. */
const BLOCK_CARD = "my-1 rounded-lg border border-border bg-muted/30 py-0.5";
/** A questions block inside a block or loop: a group with a bar on its left, in the questions blocks' colour. */
const NESTED_BLOCK = "my-0.5 ml-2 border-l-2 border-secondary/50 pb-0.5";
const BLOCK_INDENT = "pl-4";

/**
 * The design's top level: its blocks (questions blocks and unit loops), each
 * a card; the Study entry is shown above the tree (SessionHeader).
 */
export function BlockList({ items }: { items: TopLevelItem[] }) {
  return (
    <div className="flex flex-col">
      {items
        .filter((item) => item.type !== "session")
        .map((item) => (
          <TreeNodeView key={getItemKey(item)} item={item} top />
        ))}
      <PreviewLine position={{ into: null }} />
    </div>
  );
}

interface TreeListProps {
  nodes: TreeNode[];
  /** Container owning this list. */
  parent: TreeNode;
}

/** Renders a block's or loop's items (recursing into nested blocks). */
export function TreeList({ nodes, parent }: TreeListProps) {
  const end: TreePosition = { into: getItemKey(parent) };
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
 * An item. Blocks render as a container holding their own row and their
 * items: at the top level a card, nested a group with a bar on its left.
 */
function TreeNodeView({ item, top = false }: { item: TreeNode; top?: boolean }) {
  const children = getChildren(item);
  const after: TreePosition = { after: getItemKey(item) };
  const before: TreePosition = { before: getItemKey(item) };
  if (!children) {
    return (
      <>
        <PreviewLine position={before} />
        {/* data-flip-key: glides to its new place when moved (useFlip in DesignTreeView) */}
        <div data-flip-key={getItemKey(item)}>
          <TreeItemRow item={item} />
        </div>
        <PreviewLine position={after} />
      </>
    );
  }
  return (
    <>
      <PreviewLine position={before} />
      <div
        data-flip-key={getItemKey(item)}
        className={cn(top ? BLOCK_CARD : NESTED_BLOCK, ITEM_TYPES[item.type].blockClass)}
      >
        <TreeItemRow item={item} />
        <div className={BLOCK_INDENT}>
          <TreeList nodes={children} parent={item} />
        </div>
      </div>
      <PreviewLine position={after} />
    </>
  );
}

/** Where an add or move button will put items. */
function PreviewLine({ position }: { position: TreePosition }) {
  const { preview } = useDesignTree();
  if (!preview.some((p) => samePosition(p, position))) return null;
  return (
    <div className="relative h-0">
      <InsertionLine />
    </div>
  );
}
