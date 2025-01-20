import { JobBlock, JobBlockMeta } from "@/app/types";

type T = JobBlock | JobBlockMeta;

export function sortNestedBlocks(blocks: T[]): T[] {
  const sortedBlocks: T[] = [];
  const phases = ["preSurvey", "annotate", "postSurvey"];
  for (let phase of phases) {
    const phaseBlocks = blocks.filter((b) => b.phase === phase);
    sortedBlocks.push(...sortNestedBlocksInPhase(phaseBlocks));
  }

  console.log(sortedBlocks);

  return sortedBlocks;
}

function sortNestedBlocksInPhase(blocks: T[]): T[] {
  const roots = blocks.filter((b) => !b.parentId);
  const used = new Set<number>(); // prevent infinite loops

  function recursiveSort(parents: T[]): T[] {
    let sortedBlocks: T[] = [];
    const sortedParents = parents.sort((a, b) => a.position - b.position);
    for (let parent of sortedParents) {
      if (used.has(parent.id)) continue;
      used.add(parent.id);
      sortedBlocks.push(parent);
      const children = blocks.filter((b) => b.parentId === parent.id);
      if (children.length === 0) continue;
      sortedBlocks.push(...recursiveSort(children));
    }
    return sortedBlocks;
  }

  return recursiveSort(roots);
}
