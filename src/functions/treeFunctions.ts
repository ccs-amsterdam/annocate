import { BlockType } from "@/app/types";

export const validParents: Record<BlockType, (BlockType | "ROOT")[]> = {
  annotationPhase: ["ROOT", "annotationPhase"],
  surveyPhase: ["ROOT", "surveyPhase"],
  annotationQuestion: ["annotationPhase"],
  surveyQuestion: ["surveyPhase"], //
};

export function getValidChildren(type: BlockType | null): BlockType[] {
  return validChildren[type ?? "ROOT"] ?? [];
}

export function isValidParent(type: BlockType, parentType: BlockType | null): boolean {
  const valid = validParents[type];
  return valid.includes(parentType ?? "ROOT");
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

function createParentMap<T extends Edges>(blocks: T[]): Map<number | null, T[]> {
  const parentMap = new Map<number | null, T[]>();
  for (const block of blocks) {
    if (!parentMap.has(block.parentId)) parentMap.set(block.parentId, []);
    parentMap.get(block.parentId)?.push(block);
  }
  return parentMap;
}

const validChildren: Record<BlockType | "ROOT", BlockType[]> = Object.entries(validParents).reduce(
  (acc, [child, parents]) => {
    for (const parent of parents) {
      if (!acc[parent]) acc[parent] = [];
      acc[parent].push(child as BlockType);
    }
    return acc;
  },
  {} as Record<BlockType | "ROOT", BlockType[]>,
);
