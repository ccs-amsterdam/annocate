import { JobBlockResponse, JobBlockTreeResponse } from "@/app/types";

type T = JobBlockResponse | JobBlockTreeResponse;

interface Add {
  level: number;
  children: number;
}

/**
 * Sorts an array of blocks into a nested structure based on their phases and parent-child relationships.
 * Trows an error if a cycle is encountered
 * Automatically re-indexes positions to integers starting from 0 per parent
 *
 * @param {T[]} blocks - The array of blocks to be sorted.
 * @returns {T[]} - The sorted array of blocks.
 */
export function sortNestedBlocks(blocks: T[]): (T & Add)[] {
  const roots = blocks.filter((b) => !b.parentId);
  const used = new Set<number>(); // prevent infinite loops

  function recursiveSort(parents: T[], level: number): (T & Add)[] {
    let sortedBlocks: (T & Add)[] = [];
    const sortedParents = parents.sort((a, b) => a.position - b.position);
    let i = 0;
    for (let parent of sortedParents) {
      if (used.has(parent.id)) throw new Error("Cycle detected in block tree");
      used.add(parent.id);

      const children = blocks.filter((b) => b.parentId === parent.id);

      parent.position = i++;
      sortedBlocks.push({ ...parent, level, children: children.length });

      if (children.length === 0) continue;
      sortedBlocks.push(...recursiveSort(children, level + 1));
    }
    return sortedBlocks;
  }

  return recursiveSort(roots, 0);
}
