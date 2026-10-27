import {
  itemName,
  type CodebookItem,
  type TopLevelItem,
  type InLoopItem,
  type UnitLoopItem,
  type ConditionItem,
} from "@annotinder/contracts";
import { findItem, findParent, flattenTree, isInsideUnitLoop, keyOf } from "./tree";

export type MoveTargetPosition = "before" | "after" | "inside";

/**
 * An item as the tree edits below handle it: any codebook item, with the
 * editor's `_key` (stable identity while names are edited; conditions have
 * no name) and children.
 */
interface Node {
  _key?: string;
  name?: string;
  type: string;
  children?: Node[];
}

const asNodes = (items: (TopLevelItem | InLoopItem | CodebookItem)[]) => items as unknown as Node[];
const asItems = (nodes: Node[]) => nodes as unknown as TopLevelItem[];
const hasChildren = (node: Node): node is Node & { children: Node[] } => Array.isArray(node.children);

/** An item's children (loops and conditions), else none. */
function childrenOf(item: CodebookItem | TopLevelItem | InLoopItem): (TopLevelItem | InLoopItem)[] {
  return "children" in item && Array.isArray(item.children) ? (item.children as (TopLevelItem | InLoopItem)[]) : [];
}

let keySeed = 0;
export function generateKey(): string {
  keySeed += 1;
  return `k_${Date.now().toString(36)}_${keySeed}_${Math.random().toString(36).slice(2, 7)}`;
}

export function ensureKeys<T extends TopLevelItem[] | InLoopItem[]>(items: T): T {
  const withKeys = (nodes: Node[]): Node[] =>
    nodes.map((node) => {
      const copy: Node = { ...node, _key: node._key || generateKey() };
      if (hasChildren(copy)) copy.children = withKeys(copy.children);
      return copy;
    });
  return withKeys(asNodes(items)) as unknown as T;
}

export function stripKeys<T extends TopLevelItem[] | InLoopItem[]>(items: T): T {
  const withoutKeys = (nodes: Node[]): Node[] =>
    nodes.map((node) => {
      const rest: Node = { ...node };
      delete rest._key;
      if (hasChildren(rest)) rest.children = withoutKeys(rest.children);
      return rest;
    });
  return withoutKeys(asNodes(items)) as unknown as T;
}

export function getUniqueItemName(
  items: (TopLevelItem | InLoopItem)[],
  prefix = "item",
): string {
  const existingNames = new Set(flattenTree(items).map(itemName));
  let counter = 1;
  while (existingNames.has(`${prefix}_${counter}`)) {
    counter += 1;
  }
  return `${prefix}_${counter}`;
}

/**
 * Pure tree manipulation edit operations over hierarchical codebook items.
 */

export function insertItem(
  items: TopLevelItem[],
  parentIdentifier: string | null,
  newItem: CodebookItem,
): TopLevelItem[] {
  if (parentIdentifier === null) {
    return [...items, newItem as TopLevelItem];
  }

  function insertInNodes(nodes: Node[]): Node[] {
    return nodes.map((node) => {
      if (
        (node._key === parentIdentifier || node.name === parentIdentifier) &&
        hasChildren(node)
      ) {
        return {
          ...node,
          children: [...node.children, ...asNodes([newItem])],
        };
      }
      if (hasChildren(node)) {
        return {
          ...node,
          children: insertInNodes(node.children),
        };
      }
      return node;
    });
  }

  return asItems(insertInNodes(asNodes(items)));
}

export function insertItemBefore(
  items: TopLevelItem[],
  targetIdentifier: string,
  newItem: CodebookItem,
): TopLevelItem[] {
  function insertInNodes(nodes: Node[]): { list: Node[]; inserted: boolean } {
    const idx = nodes.findIndex(
      (n) => n._key === targetIdentifier || n.name === targetIdentifier,
    );
    if (idx !== -1) {
      const copy = [...nodes];
      copy.splice(idx, 0, ...asNodes([newItem]));
      return { list: copy, inserted: true };
    }

    let didInsert = false;
    const nextList = nodes.map((node) => {
      if (didInsert) return node;
      if (hasChildren(node)) {
        const res = insertInNodes(node.children);
        if (res.inserted) {
          didInsert = true;
          return { ...node, children: res.list };
        }
      }
      return node;
    });

    return { list: nextList, inserted: didInsert };
  }

  return insertInNodes(asNodes(items)).list as TopLevelItem[];
}

export function deleteItem(items: TopLevelItem[], identifier: string): TopLevelItem[] {
  function deleteFromNodes(nodes: Node[]): Node[] {
    return nodes
      .filter((node) => node._key !== identifier && node.name !== identifier)
      .map((node) => {
        if (hasChildren(node)) {
          return {
            ...node,
            children: deleteFromNodes(node.children),
          };
        }
        return node;
      });
  }

  return asItems(deleteFromNodes(asNodes(items)));
}

/**
 * Validates whether moving sourceItem relative to target with position is schema-valid.
 */
export function canMoveItemTo(
  items: TopLevelItem[],
  sourceIdentifier: string,
  targetIdentifier: string,
  position: MoveTargetPosition,
): boolean {
  if (sourceIdentifier === targetIdentifier) return false;

  const sourceItem = findItem(items, sourceIdentifier);
  const targetItem = findItem(items, targetIdentifier);
  if (!sourceItem || !targetItem) return false;

  const sourceKey = keyOf(sourceItem);
  const targetKey = keyOf(targetItem);
  if (sourceKey && targetKey && sourceKey === targetKey) return false;

  // Cannot move into own descendants
  if (childrenOf(sourceItem).length > 0) {
    const descendants = flattenTree(childrenOf(sourceItem));
    if (descendants.some((d) => d === targetItem || (targetKey && keyOf(d) === targetKey))) {
      return false;
    }
  }

  // Determine target container (parent)
  let targetParent: (UnitLoopItem | ConditionItem) | null;
  if (position === "inside") {
    // Target must be a container with children
    if (targetItem.type !== "unit_loop" && targetItem.type !== "condition") {
      return false;
    }
    targetParent = targetItem as UnitLoopItem | ConditionItem;
  } else {
    // Destination parent is target's parent
    targetParent = findParent(items, targetKey || itemName(targetItem) || "");
  }

  const isTargetInLoop =
    targetParent !== null &&
    (targetParent.type === "unit_loop" ||
      isInsideUnitLoop(items, keyOf(targetParent) || itemName(targetParent) || ""));

  // Check item type constraints:
  if (sourceItem.type === "question") {
    if (isTargetInLoop) {
      if (sourceItem.variable?.type === "auto") return false;
    } else {
      if (sourceItem.variable?.type === "span" || sourceItem.variable?.type === "relation") return false;
    }
  } else if (sourceItem.type === "unit_loop") {
    // Loops cannot be inside another loop
    if (isTargetInLoop) return false;
    if (position === "inside" && targetItem.type === "unit_loop") return false;
  } else if (sourceItem.type === "condition") {
    const sourceDescendants = flattenTree(
      childrenOf(sourceItem),
    );
    const hasInLoopOnly = sourceDescendants.some(
      (d) => d.type === "question" && (d.variable?.type === "span" || d.variable?.type === "relation"),
    );
    const hasTopOnly = sourceDescendants.some(
      (d) =>
        d.type === "unit_loop" ||
        (d.type === "question" && d.variable?.type === "auto"),
    );

    if (isTargetInLoop && hasTopOnly) return false;
    if (!isTargetInLoop && hasInLoopOnly) return false;
  }

  return true;
}

export function canMoveToRootEnd(items: TopLevelItem[], sourceIdentifier: string): boolean {
  const sourceItem = findItem(items, sourceIdentifier);
  if (!sourceItem) return false;
  const lastRoot = items[items.length - 1];
  if (lastRoot === sourceItem) {
    return false;
  }
  if (
    sourceItem.type === "question" &&
    (sourceItem.variable?.type === "span" || sourceItem.variable?.type === "relation")
  ) {
    return false;
  }
  if (sourceItem.type === "condition") {
    const descendants = flattenTree(childrenOf(sourceItem));
    if (
      descendants.some(
        (d) => d.type === "question" && (d.variable?.type === "span" || d.variable?.type === "relation"),
      )
    ) {
      return false;
    }
  }
  return true;
}

export function moveToRootEnd(items: TopLevelItem[], sourceIdentifier: string): TopLevelItem[] {
  const sourceItem = findItem(items, sourceIdentifier);
  if (!sourceItem) return items;
  const without = deleteItem(items, sourceIdentifier);
  return [...without, sourceItem as TopLevelItem];
}

/**
 * Moves an item from its current position to a new location relative to target:
 * "before": insert as sibling directly before target
 * "after": insert as sibling directly after target
 * "inside": insert as child at the end of target's children
 */
export function moveItemTo(
  items: TopLevelItem[],
  sourceIdentifier: string,
  targetIdentifier: string,
  position: MoveTargetPosition,
): TopLevelItem[] {
  if (sourceIdentifier === targetIdentifier) return items;

  const sourceItem = findItem(items, sourceIdentifier);
  const targetItem = findItem(items, targetIdentifier);
  if (!sourceItem || !targetItem) return items;

  const sourceKey = keyOf(sourceItem);
  const targetKey = keyOf(targetItem);
  if (sourceKey && targetKey && sourceKey === targetKey) return items;

  // Cannot move into own descendants
  if (childrenOf(sourceItem).length > 0) {
    const descendants = flattenTree(childrenOf(sourceItem));
    if (descendants.some((d) => d === targetItem || (targetKey && keyOf(d) === targetKey))) {
      return items;
    }
  }

  const moving = asNodes([sourceItem]);

  // Step 1: Remove source item from tree
  const withoutSource = deleteItem(items, sourceKey || sourceIdentifier);

  // Step 2: Insert source item into new position relative to target
  if (position === "inside") {
    function insertInside(nodes: Node[]): Node[] {
      return nodes.map((node) => {
        if (
          (node._key === targetIdentifier ||
            node.name === targetIdentifier ||
            (targetKey && node._key === targetKey)) &&
          hasChildren(node)
        ) {
          return {
            ...node,
            children: [...node.children, ...moving],
          };
        }
        if (hasChildren(node)) {
          return {
            ...node,
            children: insertInside(node.children),
          };
        }
        return node;
      });
    }
    return asItems(insertInside(asNodes(withoutSource)));
  }

  // Step 3: Insert before or after target in its containing array
  function insertSibling(nodes: Node[]): { list: Node[]; inserted: boolean } {
    const idx = nodes.findIndex(
      (n) =>
        n._key === targetIdentifier ||
        n.name === targetIdentifier ||
        (targetKey && n._key === targetKey),
    );
    if (idx !== -1) {
      const copy = [...nodes];
      const insertIdx = position === "before" ? idx : idx + 1;
      copy.splice(insertIdx, 0, ...moving);
      return { list: copy, inserted: true };
    }

    let didInsert = false;
    const nextList = nodes.map((node) => {
      if (didInsert) return node;
      if (hasChildren(node)) {
        const res = insertSibling(node.children);
        if (res.inserted) {
          didInsert = true;
          return { ...node, children: res.list };
        }
      }
      return node;
    });

    return { list: nextList, inserted: didInsert };
  }

  return insertSibling(asNodes(withoutSource)).list as TopLevelItem[];
}

export function moveItem(
  items: TopLevelItem[],
  identifier: string,
  direction: "up" | "down",
): TopLevelItem[] {
  function moveInList(list: Node[]): { list: Node[]; moved: boolean } {
    const idx = list.findIndex((i) => i._key === identifier || i.name === identifier);
    if (idx !== -1) {
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx >= 0 && targetIdx < list.length) {
        const copy = [...list];
        const temp = copy[idx];
        copy[idx] = copy[targetIdx];
        copy[targetIdx] = temp;
        return { list: copy, moved: true };
      }
      return { list, moved: true }; // found but cannot move past boundary
    }

    // Recurse into children
    let didMove = false;
    const nextList = list.map((node) => {
      if (didMove) return node;
      if (hasChildren(node)) {
        const res = moveInList(node.children);
        if (res.moved) {
          didMove = true;
          return { ...node, children: res.list };
        }
      }
      return node;
    });

    return { list: nextList, moved: didMove };
  }

  return moveInList(asNodes(items)).list as TopLevelItem[];
}

export function indentItem(items: TopLevelItem[], identifier: string): TopLevelItem[] {
  function indentInList(list: Node[]): {
    list: Node[];
    handled: boolean;
  } {
    const idx = list.findIndex((i) => i._key === identifier || i.name === identifier);
    if (idx > 0) {
      const prevSibling = list[idx - 1];
      if (
        (prevSibling.type === "unit_loop" || prevSibling.type === "condition") &&
        hasChildren(prevSibling)
      ) {
        const itemToIndent = list[idx];
        const remaining = list.filter((_, i) => i !== idx);
        const updatedPrev = {
          ...prevSibling,
          children: [...prevSibling.children, itemToIndent],
        };
        remaining[idx - 1] = updatedPrev;
        return { list: remaining, handled: true };
      }
    }

    let didHandle = false;
    const nextList = list.map((node) => {
      if (didHandle) return node;
      if (hasChildren(node)) {
        const res = indentInList(node.children);
        if (res.handled) {
          didHandle = true;
          return { ...node, children: res.list };
        }
      }
      return node;
    });

    return { list: nextList, handled: didHandle };
  }

  return indentInList(asNodes(items)).list as TopLevelItem[];
}

export function outdentItem(items: TopLevelItem[], identifier: string): TopLevelItem[] {
  const item = findItem(items, identifier);
  if (!item) return items;

  const parent = findParent(items, identifier);
  if (!parent) return items;

  return moveItemTo(
    items,
    keyOf(item) || itemName(item) || "",
    keyOf(parent) || itemName(parent) || "",
    "after",
  );
}

export function updateItem(
  items: TopLevelItem[],
  identifier: string,
  updated: CodebookItem,
): TopLevelItem[] {
  function updateInNodes(nodes: Node[]): Node[] {
    return nodes.map((node) => {
      if (node._key === identifier || node.name === identifier) {
        const children =
          "children" in updated ? asNodes(childrenOf(updated)) : node.children;

        return {
          ...node,
          ...updated,
          ...(children !== undefined ? { children } : {}),
        };
      }
      if (hasChildren(node)) {
        return {
          ...node,
          children: updateInNodes(node.children),
        };
      }
      return node;
    });
  }

  return asItems(updateInNodes(asNodes(items)));
}

/**
 * A place in the tree: right before or after an item, or at the end of a
 * container's children (`into: null`: the end of the codebook).
 */
export type TreePosition = { before: string } | { after: string } | { into: string | null };

const idOf = (item: CodebookItem | TopLevelItem | InLoopItem) => keyOf(item) || itemName(item) || "";

/**
 * Where a row's "add" (or "move below") can put an item: below the row.
 * For a container that is the top of its children; for any other item it
 * is after it. That is ambiguous only at the end of a container: after its
 * last item (or inside an empty container) is also after the container,
 * and after each container that one is the last item of, so those places
 * follow, from the innermost out.
 */
export function addPositions(items: TopLevelItem[], key: string): TreePosition[] {
  const item = findItem(items, key);
  if (!item) return [];
  if ("children" in item && Array.isArray(item.children)) {
    const first = item.children[0];
    if (first) return [{ before: idOf(first) }];
  }
  const positions: TreePosition[] =
    "children" in item && Array.isArray(item.children) ? [{ into: key }, { after: key }] : [{ after: key }];
  for (let parent = findParent(items, key), child = key; parent; parent = findParent(items, child)) {
    const last = parent.children[parent.children.length - 1];
    if (!last || idOf(last) !== child) break;
    child = idOf(parent);
    positions.push({ after: child });
  }
  return positions;
}

/** Whether new items at a position are inside a unit loop. */
export function positionInLoop(items: TopLevelItem[], position: TreePosition): boolean {
  if ("into" in position) {
    if (position.into === null) return false;
    const container = findItem(items, position.into);
    return container?.type === "unit_loop" || isInsideUnitLoop(items, position.into);
  }
  return isInsideUnitLoop(items, "before" in position ? position.before : position.after);
}

/** A new item inserted at a position. */
export function insertAt(items: TopLevelItem[], position: TreePosition, newItem: CodebookItem): TopLevelItem[] {
  if ("into" in position) return insertItem(items, position.into, newItem);
  if ("before" in position) return insertItemBefore(items, position.before, newItem);
  const target = position.after;
  function insertInNodes(nodes: Node[]): Node[] {
    const idx = nodes.findIndex((n) => n._key === target || n.name === target);
    if (idx !== -1) return [...nodes.slice(0, idx + 1), ...asNodes([newItem]), ...nodes.slice(idx + 1)];
    return nodes.map((node) => (hasChildren(node) ? { ...node, children: insertInNodes(node.children) } : node));
  }
  return asItems(insertInNodes(asNodes(items)));
}

/**
 * The items of a selection that are not inside another selected item (a
 * selected container brings its children), in codebook order.
 */
export function topmostSelected(items: TopLevelItem[], keys: ReadonlySet<string>): string[] {
  const result: string[] = [];
  const walk = (nodes: (TopLevelItem | InLoopItem)[]) => {
    for (const node of nodes) {
      if (keys.has(idOf(node))) result.push(idOf(node));
      else walk(childrenOf(node));
    }
  };
  walk(items);
  return result;
}

/** Whether an item is selected itself or is inside a selected item. */
export function isInSelection(items: TopLevelItem[], keys: ReadonlySet<string>, key: string): boolean {
  for (let k: string | null = key; k; ) {
    if (keys.has(k)) return true;
    const parent = findParent(items, k);
    k = parent ? idOf(parent) : null;
  }
  return false;
}

/**
 * Whether all of `sources` (topmost selected items) can move to a position:
 * the position is not in or right at one of them, and each may be there
 * (a loop not in a loop, span questions only in a loop, ...).
 */
export function canMoveAllTo(items: TopLevelItem[], sources: string[], position: TreePosition): boolean {
  if (sources.length === 0) return false;
  const selection = new Set(sources);
  if ("into" in position) {
    if (position.into === null) {
      const last = items[items.length - 1];
      return sources.every((s) => canMoveToRootEnd(items, s) || (last && idOf(last) === s));
    }
    if (isInSelection(items, selection, position.into)) return false;
    return sources.every((s) => canMoveItemTo(items, s, position.into as string, "inside"));
  }
  const target = "before" in position ? position.before : position.after;
  if (isInSelection(items, selection, target)) return false;
  const side = "before" in position ? "before" : "after";
  return sources.every((s) => canMoveItemTo(items, s, target, side));
}

/** The order and nesting of the items, by key: what a move changes. */
function shape(items: (TopLevelItem | InLoopItem)[]): string {
  return items.map((i) => `${idOf(i)}(${shape(childrenOf(i))})`).join(",");
}

/** Whether moving items to a position changes anything (right after themselves it does not). */
export function moveChanges(items: TopLevelItem[], sources: string[], position: TreePosition): boolean {
  return shape(moveAllTo(items, sources, position)) !== shape(items);
}

/** Items (topmost selected, in codebook order) moved to a position, keeping their order. */
export function moveAllTo(items: TopLevelItem[], sources: string[], position: TreePosition): TopLevelItem[] {
  if ("into" in position) {
    return sources.reduce(
      (acc, s) => (position.into === null ? moveToRootEnd(acc, s) : moveItemTo(acc, s, position.into, "inside")),
      items,
    );
  }
  if ("before" in position) return sources.reduce((acc, s) => moveItemTo(acc, s, position.before, "before"), items);
  // After a target: each next one after the one moved before it.
  let after = position.after;
  return sources.reduce((acc, s) => {
    const next = moveItemTo(acc, s, after, "after");
    after = s;
    return next;
  }, items);
}

/** Items (and what is inside them) deleted. */
export function deleteItems(items: TopLevelItem[], keys: string[]): TopLevelItem[] {
  return keys.reduce(deleteItem, items);
}
