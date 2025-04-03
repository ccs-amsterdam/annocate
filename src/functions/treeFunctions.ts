import { CodebookNode, CodebookNodeResponse, CodebookNodeType } from "@/app/types";

type Phase = "annotation" | "survey";
type TreeType = "root" | "phase" | "group" | "leaf";

export const codebookNodeType = [
  "Survey phase",
  "Survey group",
  "Annotation phase",
  "Annotation group",
  "Question task",
  "Annotation task",
] as const;

const typeMap: Record<CodebookNodeType | "root", { phases: Phase[]; treeType: TreeType }> = {
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
export function codebookItemTypeDetails(type: CodebookNodeType | null): {
  phases: Phase[];
  treeType: TreeType;
} {
  return typeMap[type ?? "root"];
}

export function isValidParent(type: CodebookNodeType, parentType: CodebookNodeType | null): boolean {
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

export function getValidChildren(
  type: CodebookNodeType | null,
): Record<"phase" | "group" | "leaf", CodebookNodeType[]> {
  const children = { phase: [], group: [], leaf: [] } as Record<"phase" | "group" | "leaf", CodebookNodeType[]>;

  const typeDetails = codebookItemTypeDetails(type);
  if (typeDetails.treeType === "leaf") return children;

  for (const option of codebookNodeType) {
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

export function createsCycle<T extends Tree>(nodes: T[], checkId: number): boolean {
  const maxTries = nodes.length;

  function recursiveCheck(id: number, i: number): boolean {
    // This shouldn't happen, but is a fail safe to prevent infinite loops.
    if (i > maxTries) return true;

    const node = nodes.find((b) => b.id === id);
    if (!node) throw "Block not found";

    if (node.parentId === null) return false;
    if (node.parentId === checkId) return true;

    return recursiveCheck(node.parentId, i + 1);
  }

  return recursiveCheck(checkId, 0);
}

export function prepareCodebook(nodes: CodebookNodeResponse[]): CodebookNode[] {
  const roots = nodes.filter((b) => !b.parentId);
  const used = new Set<number>(); // prevent infinite loops
  const parentMap = createParentMap(nodes);

  function recursiveProcess(parents: CodebookNodeResponse[], level: number): CodebookNode[] {
    let codebook: CodebookNode[] = [];
    const sortedParents = parents.sort((a, b) => a.position - b.position);
    let i = 0;
    for (let parent of sortedParents) {
      if (used.has(parent.id)) throw new Error("Cycle detected in codebook");
      used.add(parent.id);

      const children = parentMap.get(parent.id) ?? [];

      parent.position = i++;
      codebook.push({ ...parent, level, children: children.length });

      if (children.length === 0) continue;
      codebook.push(...recursiveProcess(children, level + 1));
    }
    return codebook;
  }

  return recursiveProcess(roots, 0);
}

interface Edges {
  id: number;
  parentId: number | null;
}

export function getRecursiveChildren<T extends Edges>(nodes: T[], id: number): T[] {
  const parentMap = createParentMap(nodes);

  function recursiveGet(parentId: number): T[] {
    const result = parentMap.get(parentId) ?? [];
    for (const child of result) {
      result.push(...recursiveGet(child.id));
    }
    return result;
  }

  return recursiveGet(id);
}

export function createParentMap<T extends Edges>(nodes: T[]): Map<number | null, T[]> {
  const parentMap = new Map<number | null, T[]>();
  for (const node of nodes) {
    if (!parentMap.has(node.parentId)) parentMap.set(node.parentId, []);
    parentMap.get(node.parentId)?.push(node);
  }
  return parentMap;
}
