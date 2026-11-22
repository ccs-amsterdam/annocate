import { cn } from "cn";
import type { TopLevelItem } from "@annotinder/contracts";
import type { TreePosition } from "../../../design/itemEdit";
import { isElse } from "../../../codebook/tree";
import { TreeItemRow } from "./TreeItemRow";
import { ITEM_TYPES } from "./itemTypes";
import { InsertionLine } from "./TreeRow";
import { samePosition, useDesignTree } from "./context";
import { getChildren, getItemKey, type TreeNode } from "./utils";

/** A unit loop, and each run of coder-level items between loops: a light card. */
const CARD = "my-1 rounded-lg border border-border py-0.5";
/** The coder-level items' cards: a faint tint of the questions' colour, set apart from the loops. */
const CODER_SECTION = "bg-secondary/5";
const LOOP_CARD = "bg-muted/30";
/** A block, at any level: its items one step in. */
const BLOCK = "my-0.5";
/** One step in: a child's checkbox under its parent's icon, its icon where the parent's name starts. */
const INDENT = "pl-6";

/**
 * The design's top level: each unit loop a card, and the coder-level items
 * before, between and after loops together in a tinted card (a section,
 * only in the tree). The Study entry is shown above the tree.
 */
export function BlockList({ items }: { items: TopLevelItem[] }) {
  const sections: { key: string; loop: boolean; items: TopLevelItem[] }[] = [];
  for (const item of items) {
    if (item.type === "session") continue;
    const last = sections.at(-1);
    if (item.type !== "unit_loop" && last && !last.loop) last.items.push(item);
    else sections.push({ key: getItemKey(item), loop: item.type === "unit_loop", items: [item] });
  }
  return (
    <div className="flex flex-col">
      {sections.map((section) =>
        section.loop ? (
          <TreeNodeView key={section.key} item={section.items[0]} card />
        ) : (
          <div key={section.key} className={cn(CARD, CODER_SECTION)}>
            {section.items.map((item) => (
              <TreeNodeView key={getItemKey(item)} item={item} />
            ))}
          </div>
        ),
      )}
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
 * An item. A unit loop is a card holding its row and its items; a block its
 * row with its items one step in; a block's else items an "Else" group at
 * the end of the block (only once it has items), as far in as the others.
 */
function TreeNodeView({ item, card = false }: { item: TreeNode; card?: boolean }) {
  const children = getChildren(item);
  const after: TreePosition = { after: getItemKey(item) };
  const before: TreePosition = { before: getItemKey(item) };
  if (isElse(item)) {
    if (!children?.length) return null;
    return (
      <div data-flip-key={getItemKey(item)} className="mt-0.5">
        <TreeItemRow item={item} />
        {/* As far in as the block's other items: the Else row above them says enough */}
        <TreeList nodes={children} parent={item} />
      </div>
    );
  }
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
        className={cn(card ? cn(CARD, LOOP_CARD) : BLOCK, ITEM_TYPES[item.type as keyof typeof ITEM_TYPES]?.blockClass)}
      >
        <TreeItemRow item={item} />
        <div className={INDENT}>
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
