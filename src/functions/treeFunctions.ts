import { BlockType } from "@/app/types";

type Phase = "annotation" | "survey";
type TreeType = "root" | "phase" | "group" | "leaf";

export const blockType = [
  "Survey phase",
  "Survey group",
  "Annotation phase",
  "Annotation group",
  "Question task",
  "Annotation task",
] as const;

const typeMap: Record<BlockType | "root", { phases: Phase[]; treeType: TreeType }> = {
  root: { phases: ["survey", "annotation"], treeType: "root" },
  // phases
  "Survey phase": { phases: ["survey"], treeType: "phase" },
  "Annotation phase": { phases: ["annotation"], treeType: "phase" },
  // groups
  "Survey group": { phases: ["survey"], treeType: "group" },
  "Annotation group": { phases: ["annotation"], treeType: "group" },
  // leafs
  "Question task": { phases: [], treeType: "leaf" },
  "Annotation task": { phases: ["annotation"], treeType: "leaf" },
};

/**
 * Codebook item types are related to each other in a tree structure.
 * Here we defined the tree properties of each type.
 * - phases: defined what phases a type can be part of.
 * - treeType: defined in what positions of the tree a type can be.
 */
export function codebookItemTypeDetails(type: BlockType | null): {
  phases: Phase[];
  treeType: TreeType;
} {
  return typeMap[type ?? "root"];
}

export function isValidParent(type: BlockType, parentType: BlockType | null): boolean {
  const typeDetails = codebookItemTypeDetails(type);

  // If the parent is null, the type must be a root
  if (parentType === null) {
    return typeDetails.treeType === "phase";
  }

  // The child can not have any phases that the parent does not have
  const parentDetails = codebookItemTypeDetails(parentType);
  for (const phase of typeDetails.phases) {
    if (!parentDetails.phases.includes(phase)) return false;
  }

  return true;
}

export function getValidChildren(type: BlockType | null): Record<"phase" | "group" | "leaf", BlockType[]> {
  const children = { phase: [], group: [], leaf: [] } as Record<"phase" | "group" | "leaf", BlockType[]>;

  const typeDetails = codebookItemTypeDetails(type);
  if (typeDetails.treeType === "leaf") return children;

  for (const option of blockType) {
    if (!isValidParent(option, type)) continue;
    const optionDetails = codebookItemTypeDetails(option);
    if (optionDetails.treeType !== "root") children[optionDetails.treeType].push(option);
  }
  return children;
}

interface Add {
  level: number;
  children: number;
}

interface Tree {
  id: number;
  parentId: number | null;
  position: number;
}

export function createsCycle<T extends Tree>(blocks: T[], checkId: number): boolean {
  const maxTries = blocks.length;

  function recursiveCheck(id: number, i: number): boolean {
    // This shouldn't happen, but is a fail safe to prevent infinite loops.
    if (i > maxTries) return true;

    const block = blocks.find((b) => b.id === id);
    if (!block) throw "Block not found";

    if (block.parentId === null) return false;
    if (block.parentId === checkId) return true;

    return recursiveCheck(block.parentId, i + 1);
  }

  return recursiveCheck(checkId, 0);
}

/**
 * Sorts an array of blocks into a nested structure based on their phases and parent-child relationships.
 * Trows an error if a cycle is encountered
 * Automatically re-indexes positions to integers starting from 0 per parent
 *
 * @param {T[]} blocks - The array of blocks to be sorted.
 * @returns {T[]} - The sorted array of blocks.
 */
export function sortNestedBlocks<T extends Tree>(blocks: T[]): (T & Add)[] {
  const roots = blocks.filter((b) => !b.parentId);
  const used = new Set<number>(); // prevent infinite loops
  const parentMap = createParentMap(blocks);

  function recursiveSort(parents: T[], level: number): (T & Add)[] {
    let sortedBlocks: (T & Add)[] = [];
    const sortedParents = parents.sort((a, b) => a.position - b.position);
    let i = 0;
    for (let parent of sortedParents) {
      if (used.has(parent.id)) throw new Error("Cycle detected in block tree");
      used.add(parent.id);

      const children = parentMap.get(parent.id) ?? [];

      parent.position = i++;
      sortedBlocks.push({ ...parent, level, children: children.length });

      if (children.length === 0) continue;
      sortedBlocks.push(...recursiveSort(children, level + 1));
    }
    return sortedBlocks;
  }

  return recursiveSort(roots, 0);
}

interface Edges {
  id: number;
  parentId: number | null;
}

export function getRecursiveChildren<T extends Edges>(blocks: T[], id: number): T[] {
  const parentMap = createParentMap(blocks);

  function recursiveGet(parentId: number): T[] {
    const result = parentMap.get(parentId) ?? [];
    for (const child of result) {
      result.push(...recursiveGet(child.id));
    }
    return result;
  }

  return recursiveGet(id);
}

export function createParentMap<T extends Edges>(blocks: T[]): Map<number | null, T[]> {
  const parentMap = new Map<number | null, T[]>();
  for (const block of blocks) {
    if (!parentMap.has(block.parentId)) parentMap.set(block.parentId, []);
    parentMap.get(block.parentId)?.push(block);
  }
  return parentMap;
}
