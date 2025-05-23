import {
  CodebookNode,
  CodebookNodeData,
  CodebookNodeResponse,
  CodebookNodeType,
  DataIndicator,
  Dependencies,
  Phase,
  TreeType,
  TypeDetails,
} from "@/app/types";
import { extractDataIndictors } from "@/hooks/useSandboxedEval";

export const codebookNodeType = [
  "Survey phase",
  "Survey group",
  "Annotation phase",
  "Annotation group",
  "Question",
  "Annotation task",
] as const;

const typeMap: Record<CodebookNodeType | "root", TypeDetails> = {
  root: { phases: ["survey", "annotation"], treeType: "root" },
  // phases
  "Survey phase": { phases: ["survey"], treeType: "phase" },
  "Annotation phase": { phases: ["annotation"], treeType: "phase" },
  // groups
  "Survey group": { phases: ["survey"], treeType: "group" },
  "Annotation group": { phases: ["annotation"], treeType: "group" },
  // variables
  Question: { phases: [], treeType: "variable" },
  "Annotation task": { phases: ["annotation"], treeType: "variable" },
};

/**
 * Codebook item types are related to each other in a tree structure.
 * Here we defined the tree properties of each type.
 * - phases: defined what phases a type can be part of.
 * - treeType: defined in what positions of the tree a type can be.
 */
export function codebookNodeTypeDetails(type: CodebookNodeType | null): {
  phases: Phase[];
  treeType: TreeType;
} {
  return typeMap[type ?? "root"];
}

/**


*/
export function isValidParent(type: CodebookNodeType, parentType: CodebookNodeType | null): boolean {
  const typeDetails = codebookNodeTypeDetails(type);
  const parentDetails = codebookNodeTypeDetails(parentType);

  // Root can only have phase children, and phase an only have root parents
  if (parentDetails.treeType === "root" && typeDetails.treeType !== "phase") return false;
  if (typeDetails.treeType === "phase" && parentDetails.treeType !== "root") return false;

  if (parentDetails.treeType === "variable") return false;

  // The child can not have any phases that the parent does not have
  for (const phase of typeDetails.phases) {
    if (!parentDetails.phases.includes(phase)) return false;
  }

  return true;
}

export function getValidChildren(
  type: CodebookNodeType | null,
): Record<"phase" | "group" | "variable", CodebookNodeType[]> {
  const children = { phase: [], group: [], variable: [] } as Record<"phase" | "group" | "variable", CodebookNodeType[]>;

  const typeDetails = codebookNodeTypeDetails(type);
  if (typeDetails.treeType === "variable") return children;

  for (const option of codebookNodeType) {
    if (!isValidParent(option, type)) continue;
    const optionDetails = codebookNodeTypeDetails(option);
    if (optionDetails.treeType !== "root") children[optionDetails.treeType].push(option);
  }
  return children;
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
  const phases = nodes.filter((b) => !b.parentId);
  const used = new Set<number>(); // prevent infinite loops
  const parentMap = createParentMap(nodes);

  function recursiveProcess(
    parents: CodebookNodeResponse[],
    parentPath: CodebookNode["parentPath"],
    globalPosition: number = 0,
    inheritables: { layoutId?: number },
    insidePhase?: { phaseType: Phase; phaseId: number },
  ): CodebookNode[] {
    let codebook: CodebookNode[] = [];
    const sortedParents = parents.sort((a, b) => a.position - b.position);

    const n = sortedParents.length;
    for (let i = 0; i < n; i++) {
      globalPosition += 1;
      const parent = sortedParents[i];
      const typeDetails = codebookNodeTypeDetails(parent.data.type);
      const phase = insidePhase ?? {
        phaseType: typeDetails.phases[0],
        phaseId: parent.id,
      };

      // Inheritables are properties that are passed down from the parent to the children.
      const inherit = { ...inheritables };
      if ("layout" in parent.data) {
        inherit.layoutId = parent.id;
      }

      if (used.has(parent.id)) throw new Error("Cycle detected in codebook");
      used.add(parent.id);

      const children = parentMap.get(parent.id) ?? [];

      parent.position = i;

      const allChildren =
        children.length > 0 ? recursiveProcess(children, [...parentPath, parent], globalPosition, inherit, phase) : [];

      const nodeParent = {
        ...parent,
        position: i,
        parentPath,
        children: allChildren.map((child) => child.id),
        treeType: typeDetails.treeType,
        dependencies: getDependencies(parent.data),
        globalPosition,
        layoutId: inherit.layoutId ?? null,
        ...phase,
      };
      codebook.push(nodeParent);
      codebook.push(...allChildren);
    }
    return codebook;
  }

  return recursiveProcess(phases, [], -1, {});
}

function getDependencies(data: CodebookNodeData): Dependencies {
  // Add dependencies for any properties of the node that depend on data.
  // In other words, when they contain scripts that use data indicators.
  const dependencies: Dependencies = [];
  for (let property of ["variable", "content", "progress"] as const) {
    if (!(property in data)) continue;
    // we need this type assertion because ts does not understand that we verified this already
    const propertyObject = data[property as keyof typeof data];
    const dataIndicators = extractDataIndictors(JSON.stringify(propertyObject));
    dependencies.push({ property: "variable", dataIndicators });
  }
  return dependencies;
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
