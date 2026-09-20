import type {
  CodebookItem,
  TopLevelItem,
  InLoopItem,
  UnitLoopItem,
  ConditionItem,
} from "@annotinder/contracts";
import { findItem, findParent, flattenTree, isInsideUnitLoop } from "./tree";

export type MoveTargetPosition = "before" | "after" | "inside";

let keySeed = 0;
export function generateKey(): string {
  keySeed += 1;
  return `k_${Date.now().toString(36)}_${keySeed}_${Math.random().toString(36).slice(2, 7)}`;
}

export function ensureKeys<T extends TopLevelItem[] | InLoopItem[]>(items: T): T {
  return items.map((node) => {
    const copy: any = {
      ...node,
      _key: (node as any)._key || generateKey(),
    };
    if ("children" in copy && Array.isArray(copy.children)) {
      copy.children = ensureKeys(copy.children);
    }
    return copy;
  }) as T;
}

export function stripKeys<T extends TopLevelItem[] | InLoopItem[]>(items: T): T {
  return items.map((node) => {
    const { _key, ...rest }: any = node;
    if ("children" in rest && Array.isArray(rest.children)) {
      rest.children = stripKeys(rest.children);
    }
    return rest;
  }) as T;
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

  function insertInNodes(nodes: any[]): any[] {
    return nodes.map((node) => {
      if (
        (node._key === parentIdentifier || node.name === parentIdentifier) &&
        "children" in node &&
        Array.isArray(node.children)
      ) {
        return {
          ...node,
          children: [...node.children, newItem],
        };
      }
      if ("children" in node && Array.isArray(node.children)) {
        return {
          ...node,
          children: insertInNodes(node.children),
        };
      }
      return node;
    });
  }

  return insertInNodes(items) as TopLevelItem[];
}

export function deleteItem(items: TopLevelItem[], identifier: string): TopLevelItem[] {
  function deleteFromNodes(nodes: any[]): any[] {
    return nodes
      .filter((node) => node._key !== identifier && node.name !== identifier)
      .map((node) => {
        if ("children" in node && Array.isArray(node.children)) {
          return {
            ...node,
            children: deleteFromNodes(node.children),
          };
        }
        return node;
      });
  }

  return deleteFromNodes(items) as TopLevelItem[];
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

  const sourceKey = (sourceItem as any)._key;
  const targetKey = (targetItem as any)._key;
  if (sourceKey && targetKey && sourceKey === targetKey) return false;

  // Cannot move into own descendants
  if ("children" in sourceItem && Array.isArray((sourceItem as any).children)) {
    const descendants = flattenTree((sourceItem as any).children);
    if (
      descendants.some(
        (d) =>
          d.name === targetItem.name ||
          (targetKey && (d as any)._key === targetKey),
      )
    ) {
      return false;
    }
  }

  // Determine target container (parent)
  let targetParent: (UnitLoopItem | ConditionItem) | null = null;
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
      isInsideUnitLoop(items, (targetParent as any)._key || targetParent.name));

  // Check item type constraints:
  if (sourceItem.type === "user_variable") {
    // User variables cannot be inside loops
    if (isTargetInLoop) return false;
  } else if (sourceItem.type === "unit_variable") {
    // Unit variables must be inside a loop
    if (!isTargetInLoop) return false;
  } else if (sourceItem.type === "unit_loop") {
    // Loops cannot be inside another loop
    if (isTargetInLoop) return false;
    if (position === "inside" && targetItem.type === "unit_loop") return false;
  } else if (sourceItem.type === "condition") {
    const sourceDescendants = flattenTree(
      "children" in sourceItem ? (sourceItem as any).children : [],
    );
    const hasUnitVars = sourceDescendants.some((d) => d.type === "unit_variable");
    const hasUserVarsOrLoops = sourceDescendants.some(
      (d) => d.type === "user_variable" || d.type === "unit_loop",
    );

    if (isTargetInLoop && hasUserVarsOrLoops) return false;
    if (!isTargetInLoop && hasUnitVars) return false;
  }

  return true;
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

  const sourceKey = (sourceItem as any)._key;
  const targetKey = (targetItem as any)._key;
  if (sourceKey && targetKey && sourceKey === targetKey) return items;

  // Cannot move into own descendants
  if ("children" in sourceItem && Array.isArray((sourceItem as any).children)) {
    const descendants = flattenTree((sourceItem as any).children);
    if (
      descendants.some(
        (d) =>
          d.name === targetItem.name ||
          (targetKey && (d as any)._key === targetKey),
      )
    ) {
      return items;
    }
  }

  // Step 1: Remove source item from tree
  const withoutSource = deleteItem(items, sourceKey || sourceIdentifier);

  // Step 2: Insert source item into new position relative to target
  if (position === "inside") {
    function insertInside(nodes: any[]): any[] {
      return nodes.map((node) => {
        if (
          (node._key === targetIdentifier ||
            node.name === targetIdentifier ||
            (targetKey && node._key === targetKey)) &&
          "children" in node &&
          Array.isArray(node.children)
        ) {
          return {
            ...node,
            children: [...node.children, sourceItem],
          };
        }
        if ("children" in node && Array.isArray(node.children)) {
          return {
            ...node,
            children: insertInside(node.children),
          };
        }
        return node;
      });
    }
    return insertInside(withoutSource) as TopLevelItem[];
  }

  // Step 3: Insert before or after target in its containing array
  function insertSibling(nodes: any[]): { list: any[]; inserted: boolean } {
    const idx = nodes.findIndex(
      (n) =>
        n._key === targetIdentifier ||
        n.name === targetIdentifier ||
        (targetKey && n._key === targetKey),
    );
    if (idx !== -1) {
      const copy = [...nodes];
      const insertIdx = position === "before" ? idx : idx + 1;
      copy.splice(insertIdx, 0, sourceItem);
      return { list: copy, inserted: true };
    }

    let didInsert = false;
    const nextList = nodes.map((node) => {
      if (didInsert) return node;
      if ("children" in node && Array.isArray(node.children)) {
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

  return insertSibling(withoutSource).list as TopLevelItem[];
}

export function moveItem(
  items: TopLevelItem[],
  identifier: string,
  direction: "up" | "down",
): TopLevelItem[] {
  function moveInList(list: any[]): { list: any[]; moved: boolean } {
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
      if ("children" in node && Array.isArray(node.children)) {
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

  return moveInList(items).list as TopLevelItem[];
}

export function indentItem(items: TopLevelItem[], identifier: string): TopLevelItem[] {
  function indentInList(list: any[]): {
    list: any[];
    handled: boolean;
  } {
    const idx = list.findIndex((i) => i._key === identifier || i.name === identifier);
    if (idx > 0) {
      const prevSibling = list[idx - 1];
      if (
        (prevSibling.type === "unit_loop" || prevSibling.type === "condition") &&
        "children" in prevSibling
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
      if ("children" in node && Array.isArray(node.children)) {
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

  return indentInList(items).list as TopLevelItem[];
}

export function outdentItem(items: TopLevelItem[], identifier: string): TopLevelItem[] {
  const parent = findParent(items, identifier);
  if (!parent) return items; // Already at root level

  let extractedItem: any = null;
  const safeParent = parent;
  const parentName = safeParent.name;
  const parentKey = (safeParent as any)._key;

  // Step 1: remove item from parent's children
  function removeChild(nodes: any[]): any[] {
    return nodes.map((node) => {
      if (
        (node._key === parentKey || node.name === parentName) &&
        "children" in node &&
        Array.isArray(node.children)
      ) {
        const found = node.children.find((c: any) => c._key === identifier || c.name === identifier);
        if (found) extractedItem = found;
        return {
          ...node,
          children: node.children.filter((c: any) => c._key !== identifier && c.name !== identifier),
        };
      }
      if ("children" in node && Array.isArray(node.children)) {
        return {
          ...node,
          children: removeChild(node.children),
        };
      }
      return node;
    });
  }

  const itemsWithoutChild = removeChild(items);
  if (!extractedItem) return items;

  // Step 2: insert extractedItem immediately after parent among parent's siblings
  function insertAfterParent(nodes: any[]): any[] {
    const parentIdx = nodes.findIndex((n) => n._key === parentKey || n.name === parentName);
    if (parentIdx !== -1) {
      const copy = [...nodes];
      copy.splice(parentIdx + 1, 0, extractedItem);
      return copy;
    }

    return nodes.map((node) => {
      if ("children" in node && Array.isArray(node.children)) {
        return {
          ...node,
          children: insertAfterParent(node.children),
        };
      }
      return node;
    });
  }

  return insertAfterParent(itemsWithoutChild) as TopLevelItem[];
}

export function updateItem(
  items: TopLevelItem[],
  identifier: string,
  updated: CodebookItem,
): TopLevelItem[] {
  function updateInNodes(nodes: any[]): any[] {
    return nodes.map((node) => {
      if (node._key === identifier || node.name === identifier) {
        // Keep existing children if updated object didn't supply them
        const children =
          "children" in updated
            ? updated.children
            : "children" in node
              ? (node as UnitLoopItem | ConditionItem).children
              : undefined;

        return {
          ...node,
          ...updated,
          ...(children !== undefined ? { children } : {}),
        };
      }
      if ("children" in node && Array.isArray(node.children)) {
        return {
          ...node,
          children: updateInNodes(node.children),
        };
      }
      return node;
    });
  }

  return updateInNodes(items) as TopLevelItem[];
}
