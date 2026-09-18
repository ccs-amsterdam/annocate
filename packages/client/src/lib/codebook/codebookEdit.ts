import { parentPosition, type CodebookItem } from "@annotinder/contracts";
import { getChildren, getDescendants, getRootItems, sortByPosition } from "./tree";

/**
 * Pure, position-string-rewriting edit operations over a flat codebook item
 * array (design plan §2/§5.2), used by the codebook editor UI to build/edit
 * an in-memory draft before saving the whole document via `PUT /codebook/:id`.
 * These deliberately do NOT talk to a server or hold any state themselves --
 * every function takes the current `items` array and returns a new one.
 */

/** `Omit<T, "position">`, distributed member-wise over a union so a discriminated union stays intact. */
type OmitPosition<T> = T extends { position: string } ? Omit<T, "position"> : never;
export type NewCodebookItem = OmitPosition<CodebookItem>;


/** The position a new LAST child of `parent` (or a new last root item, if `parent` is null) should get. */
export function nextChildPosition(items: CodebookItem[], parent: string | null): string {
  const siblings = parent === null ? getRootItems(items) : getChildren(items, parent);
  const nextIndex = siblings.length + 1;
  return parent === null ? String(nextIndex) : `${parent}.${nextIndex}`;
}

/** Rewrites `position` (and everything below it) to start with `newPrefix` instead of `oldPrefix`. */
function rewritePosition(position: string, oldPrefix: string, newPrefix: string): string {
  if (position === oldPrefix) return newPrefix;
  return newPrefix + position.slice(oldPrefix.length);
}

/**
 * Renumbers the direct children of `parent` (their descendants' positions
 * are rewritten accordingly too) to be contiguous 1..n, in their current
 * relative order -- used after an insert/delete/move leaves gaps or
 * duplicate sibling indices.
 */
function renumberChildren(items: CodebookItem[], parent: string | null): CodebookItem[] {
  const siblings = parent === null ? getRootItems(items) : getChildren(items, parent);
  let next = items;
  siblings.forEach((sibling, index) => {
    const desiredPosition = parent === null ? String(index + 1) : `${parent}.${index + 1}`;
    if (sibling.position === desiredPosition) return;
    const oldPrefix = sibling.position;
    next = next.map((item) => {
      if (item.position === oldPrefix || item.position.startsWith(`${oldPrefix}.`)) {
        return { ...item, position: rewritePosition(item.position, oldPrefix, desiredPosition) } as CodebookItem;
      }
      return item;
    });
  });
  return next;
}

/** Appends `item` as the new last child of `parent` (or a new last root item), assigning its position. */
export function insertItem(items: CodebookItem[], item: NewCodebookItem, parent: string | null): CodebookItem[] {
  const position = nextChildPosition(items, parent);
  return [...items, { ...item, position } as CodebookItem];
}

/** Removes `position` and all of its descendants, then closes the resulting gap among its former siblings. */
export function deleteItem(items: CodebookItem[], position: string): CodebookItem[] {
  const parent = parentPosition(position);
  const toRemove = new Set([position, ...getDescendants(items, position).map((d) => d.position)]);
  const remaining = items.filter((item) => !toRemove.has(item.position));
  return renumberChildren(remaining, parent);
}

/**
 * Moves `position` (and its descendants) to become a child of `newParent`
 * (or a new root item, if null), inserted at `index` (0-based) among its new
 * siblings. Renumbers both the old and new sibling groups.
 */
export function moveItem(
  items: CodebookItem[],
  position: string,
  newParent: string | null,
  index: number,
): CodebookItem[] {
  const oldParent = parentPosition(position);
  const descendants = getDescendants(items, position);
  const subtreePositions = new Set([position, ...descendants.map((d) => d.position)]);

  // Guard against moving a node into its own subtree.
  if (newParent !== null && (newParent === position || newParent.startsWith(`${position}.`))) {
    return items;
  }

  const newSiblings = newParent === null ? getRootItems(items) : getChildren(items, newParent);
  const siblingsWithoutSelf = newSiblings.filter((s) => s.position !== position);
  const clampedIndex = Math.max(0, Math.min(index, siblingsWithoutSelf.length));

  // `newParent` (as supplied by the caller) refers to the pre-move tree. If it's an ancestor/
  // sibling of `position`'s old location, renumbering the old sibling group below can shift its
  // position out from under it -- so track it by its (codebook-unique) `name` instead, and
  // re-resolve its actual position after that renumbering happens.
  const newParentName = newParent === null ? null : items.find((item) => item.position === newParent)?.name ?? null;

  // Temporarily rewrite the moved subtree's positions to a placeholder namespace so it doesn't
  // collide with existing sibling positions while we renumber the old/new sibling groups.
  const placeholderPrefix = `__moving__.${position}`;
  let next = items.map((item) =>
    subtreePositions.has(item.position)
      ? ({ ...item, position: rewritePosition(item.position, position, placeholderPrefix) } as CodebookItem)
      : item,
  );


  next = renumberChildren(next, oldParent);

  // Re-resolve the effective new-parent position (may have shifted during the renumbering above).
  const effectiveNewParent = newParentName === null ? null : next.find((item) => item.name === newParentName)?.position ?? null;

  // Insert the moved subtree at its final position among the (already-renumbered) new siblings,
  // shifting anything at/after `clampedIndex` up by one first.
  const targetSiblings = (effectiveNewParent === null ? getRootItems(next) : getChildren(next, effectiveNewParent)).filter(
    (s) => !s.position.startsWith("__moving__"),
  );
  // Iterate highest-index-first so a shifted item's new position never
  // collides with an as-yet-unshifted sibling still occupying it.
  for (let i = targetSiblings.length - 1; i >= clampedIndex; i--) {
    const sibling = targetSiblings[i];
    const shiftedPosition = effectiveNewParent === null ? String(i + 2) : `${effectiveNewParent}.${i + 2}`;
    next = next.map((item) =>
      item.position === sibling.position || item.position.startsWith(`${sibling.position}.`)
        ? ({ ...item, position: rewritePosition(item.position, sibling.position, shiftedPosition) } as CodebookItem)
        : item,
    );
  }

  const newPosition =
    effectiveNewParent === null ? String(clampedIndex + 1) : `${effectiveNewParent}.${clampedIndex + 1}`;
  next = next.map((item) =>
    item.position.startsWith(placeholderPrefix)
      ? ({ ...item, position: rewritePosition(item.position, placeholderPrefix, newPosition) } as CodebookItem)
      : item,
  );

  return sortByPosition(next);
}

