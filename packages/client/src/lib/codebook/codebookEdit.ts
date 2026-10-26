import type {
  CodebookItem,
  TopLevelItem,
  InLoopItem,
  UnitLoopItem,
  ConditionItem,
} from "@annotinder/contracts";
import { findItem, findParent, flattenTree, isInsideUnitLoop, keyOf } from "./tree";

export type MoveTargetPosition = "before" | "after" | "inside";

/**
 * An item as the tree edits below handle it: any codebook item, with the
 * editor's `_key` (stable identity while names are edited) and children.
 */
interface Node {
  _key?: string;
  name: string;
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
  const existingNames = new Set(flattenTree(items).map((i) => i.name));
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
    if (descendants.some((d) => d.name === targetItem.name || (targetKey && keyOf(d) === targetKey))) {
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
    targetParent = findParent(items, targetKey || targetItem.name);
  }

  const isTargetInLoop =
    targetParent !== null &&
    (targetParent.type === "unit_loop" ||
      isInsideUnitLoop(items, keyOf(targetParent) || targetParent.name));

  // Check item type constraints:
  if (sourceItem.type === "user_variable") {
    // User variables cannot be inside loops
    if (isTargetInLoop) return false;
  } else if (sourceItem.type === "unit_variable") {
    // Unit variables must be inside a loop
    if (!isTargetInLoop) return false;
  } else if (sourceItem.type === "question") {
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
      (d) =>
        d.type === "unit_variable" ||
        (d.type === "question" &&
          (d.variable?.type === "span" || d.variable?.type === "relation")),
    );
    const hasTopOnly = sourceDescendants.some(
      (d) =>
        d.type === "user_variable" ||
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
  const sourceKey = keyOf(sourceItem) || sourceItem.name;
  const lastRoot = items[items.length - 1];
  if (lastRoot && (keyOf(lastRoot) === sourceKey || lastRoot.name === sourceKey)) {
    return false;
  }
  if (sourceItem.type === "unit_variable") return false;
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
        (d) =>
          d.type === "unit_variable" ||
          (d.type === "question" &&
            (d.variable?.type === "span" || d.variable?.type === "relation")),
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
    if (descendants.some((d) => d.name === targetItem.name || (targetKey && keyOf(d) === targetKey))) {
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
    keyOf(item) || item.name,
    keyOf(parent) || parent.name,
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
