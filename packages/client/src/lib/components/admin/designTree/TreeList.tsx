import { cn } from "cn";
import type { TopLevelItem, UnitLoopItem } from "@annotinder/contracts";
import type { TreePosition } from "../../../design/itemEdit";
import { childrenOf, isElse } from "../../../codebook/tree";
import { TreeItemRow } from "./TreeItemRow";
import { ITEM_TYPES } from "./itemTypes";
import { InsertionLine, Rails, type Rail } from "./TreeRow";
import { samePosition, useDesignTree } from "./context";
import { getItemKey, type TreeNode } from "./utils";

/** The last twig of a level, else one with the line running on. */
type Twig = "tee" | "end";

/**
 * The design's main line, from the Start row to the "At the end" row (both
 * DesignTreeView's): each item hangs off it with a twig, a unit loop is a
 * card it runs through. The Study entry is the Start row, not an item here.
 */
export function MainLine({ items }: { items: TopLevelItem[] }) {
  return (
    <div className="flex flex-col">
      {items
        .filter((item) => item.type !== "session")
        .map((item) => (
          // The line runs on to the "At the end" row: no last twig here
          <TreeNodeView key={getItemKey(item)} item={item} lines={[]} twig="tee" />
        ))}
      <PreviewLine position={{ into: null }} depth={1} />
    </div>
  );
}

interface TreeListProps {
  nodes: TreeNode[];
  /** Container owning this list. */
  parent: TreeNode;
  /** The lines of the levels around it. */
  lines: Rail[];
}

/** A branch's items (recursing into nested branches), forking off its line; the last one's twig ends it. */
function TreeList({ nodes, parent, lines }: TreeListProps) {
  // Else items show only once there are some (begun from the branch's row)
  const shown = nodes.filter((node) => !isElse(node) || (childrenOf(node) ?? []).length > 0);
  return (
    <div className="flex flex-col">
      {shown.map((node, i) => (
        <TreeNodeView key={getItemKey(node)} item={node} lines={lines} twig={i === shown.length - 1 ? "end" : "tee"} />
      ))}
      <PreviewLine position={{ into: getItemKey(parent) }} depth={lines.length + 1} />
    </div>
  );
}

/** The lines below a twig: the level's line runs on past it, unless this was its last twig. */
const inner = (lines: Rail[], twig: Twig): Rail[] => [...lines, twig === "end" ? "none" : "pass"];

/**
 * An item, on its twig. A branch's items fork off one level in, and its
 * else items, "otherwise", once more; a unit loop is a card (LoopCard).
 */
function TreeNodeView({ item, lines, twig }: { item: TreeNode; lines: Rail[]; twig: Twig }) {
  const children = childrenOf(item);
  const after: TreePosition = { after: getItemKey(item) };
  const before: TreePosition = { before: getItemKey(item) };
  if (isElse(item)) {
    return (
      <div data-flip-key={getItemKey(item)}>
        <TreeItemRow item={item} rails={[...lines, twig]} />
        <TreeList nodes={children ?? []} parent={item} lines={inner(lines, twig)} />
      </div>
    );
  }
  // A layout in its loop is a knot on the loop's line
  const rails: Rail[] = item.type === "layout" && lines.length === 0 ? ["node"] : [...lines, twig];
  return (
    <>
      <PreviewLine position={before} depth={rails.length} />
      {/* data-flip-key: glides to its new place when moved (useFlip in DesignTreeView) */}
      <div data-flip-key={getItemKey(item)}>
        {item.type === "unit_loop" ? (
          <LoopCard loop={item} lines={lines} />
        ) : (
          <>
            <TreeItemRow item={item} rails={rails} />
            {children && <TreeList nodes={children} parent={item} lines={inner(lines, twig)} />}
          </>
        )}
      </div>
      <PreviewLine position={after} depth={rails.length} />
    </>
  );
}

/**
 * A unit loop: a card the main line runs into at the top and out of at the
 * bottom, its own items on it (layouts knots, the rest on twigs), not
 * indented. With a condition only some coders get it: the card forks off
 * and the main line runs on past it.
 */
function LoopCard({ loop, lines }: { loop: UnitLoopItem; lines: Rail[] }) {
  const forked = !!loop.condition?.script.trim();
  const children = (childrenOf(loop) ?? []) as TreeNode[];
  const card = (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col",
        ITEM_TYPES.unit_loop.containerClass,
        // On the main line: its rows' lines where the main line is (the border and padding outside them)
        !forked && "-mx-1 px-[2.5px]",
      )}
    >
      <TreeItemRow item={loop} rails={[forked ? "root" : "node"]} />
      {children.map((child, i) => (
        <TreeNodeView
          key={getItemKey(child)}
          item={child}
          lines={[]}
          // Forked, the loop's line ends at its last item; else it runs out of the card
          twig={forked && i === children.length - 1 ? "end" : "tee"}
        />
      ))}
      <PreviewLine position={{ into: getItemKey(loop) }} depth={1} />
      {forked ? <div className="h-2" /> : <RailGap lines={["pass"]} />}
    </div>
  );
  return (
    <>
      <RailGap lines={[...lines, "pass"]} />
      {forked ? (
        <div className="flex pl-2">
          <Rails rails={lines} />
          {/* The twig into the card's first row (its border, and half the 40px row, down) */}
          <span aria-hidden className="tree-rail tree-rail-tee [--twig-y:21.5px]" />
          {card}
        </div>
      ) : (
        card
      )}
      <RailGap lines={[...lines, "pass"]} />
    </>
  );
}

/** A little room above and below a loop's card, the lines running through it. */
function RailGap({ lines }: { lines: Rail[] }) {
  return (
    <div className="flex h-2.5 px-2">
      <Rails rails={lines} />
    </div>
  );
}

/** Where an add or move button will put items: from where that level's rows start (`depth`: their lines). */
function PreviewLine({ position, depth }: { position: TreePosition; depth: number }) {
  const { preview } = useDesignTree();
  if (!preview.some((p) => samePosition(p, position))) return null;
  return (
    <div className="relative h-0" style={{ marginLeft: 8 + 22 * Math.max(0, depth - 1) + 11 }}>
      <InsertionLine />
    </div>
  );
}
