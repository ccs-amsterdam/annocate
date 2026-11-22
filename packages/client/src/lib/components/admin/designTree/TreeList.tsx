import { ListChecks } from "lucide-react";
import { cn } from "cn";
import type { TopLevelItem } from "@annotinder/contracts";
import type { TreePosition } from "../../../design/itemEdit";
import { TreeItemRow } from "./TreeItemRow";
import { ITEM_TYPES } from "./itemTypes";
import { InsertionLine, TreeRow } from "./TreeRow";
import { AddItemMenu } from "./AddItemMenu";
import { samePosition, useDesignTree } from "./context";
import { getChildren, getItemKey, topBlocks, type TreeNode } from "./utils";

/** A block (a unit loop, a Questions block) as a light card: the header row, its items one step in. */
const BLOCK_CARD = "my-1 rounded-lg border border-border bg-muted/30 py-0.5";
const BLOCK_INDENT = "pl-4";

/**
 * The design's top level as blocks (`topBlocks`): unit loops, and the items
 * between them as Questions blocks. The blocks are only how the tree shows
 * them: the design keeps one list.
 */
export function BlockList({ items }: { items: TopLevelItem[] }) {
  const tree = useDesignTree();
  return (
    <div className="flex flex-col">
      {topBlocks(items).map((block) => {
        if (block.kind === "loop") return <TreeNodeView key={getItemKey(block.item)} item={block.item} />;
        const last = block.items[block.items.length - 1];
        const after: TreePosition = { after: getItemKey(last) };
        const count = block.items.length;
        return (
          <div key={block.key} className={cn(BLOCK_CARD, ITEM_TYPES.questions.blockClass)}>
            <TreeRow
              dimActions
              actions={
                tree.readOnly || tree.moving ? null : (
                  <AddItemMenu
                    title="Add a unit loop after this block"
                    options={[{ position: after, label: "After this block", types: ["unit_loop"] }]}
                    onAdd={tree.addAt}
                    onPreview={tree.setPreview}
                  />
                )
              }
            >
              {!tree.readOnly && <span className="mr-px h-3.5 w-3.5 shrink-0" aria-hidden />}
              <ListChecks className={cn("ml-1 h-4 w-4 shrink-0", ITEM_TYPES.questions.color)} />
              <span className="truncate px-1.5 py-0.5 font-medium">Questions</span>
              <span className="truncate text-xs text-muted-foreground">
                {count === 1 ? "1 item" : `${count} items`}
              </span>
            </TreeRow>
            <div className={BLOCK_INDENT}>
              {block.items.map((item) => (
                <TreeNodeView key={getItemKey(item)} item={item as TreeNode} />
              ))}
            </div>
          </div>
        );
      })}
      <PreviewLine position={{ into: null }} />
    </div>
  );
}

interface TreeListProps {
  nodes: TreeNode[];
  /** Container owning this list; null for the design root. */
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
        className={cn(item.type === "unit_loop" ? BLOCK_CARD : "my-0.5 pb-1", ITEM_TYPES[item.type].blockClass)}
      >
        <TreeItemRow item={item} />
        <div className={item.type === "unit_loop" ? BLOCK_INDENT : "pl-6"}>
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
