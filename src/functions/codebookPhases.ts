import {
  Annotation,
  Branching,
  CodebookNode,
  CodebookPhase,
  CodebookState,
  CodebookVariable,
  GetSession,
  Layout,
  Phase,
  ProgressState,
  VariableSchema,
} from "@/app/types";
import standardizeColor from "./standardizeColor";
import randomColor from "randomcolor";

export function prepareCodebookState(nodes: CodebookNode[], annotations: Annotation[]): CodebookState {
  const phases: CodebookPhase[] = [];
  const branching: Branching = {};

  // inheritables
  // - A node inherits the layout of its parent, unless it specifies a new layout
  // - If a node is skipped, all its children are skipped
  let inheritable: Record<number, { layout?: Layout; branchNodeIds: number[] }> = {};

  let phase = -1;
  for (let node of nodes) {
    if (node.parentId === null) {
      // if start of new phase, append phase array
      phase++;
      phases[phase] = {
        id: node.id,
        label: node.name.replaceAll("_", " "),
        type: node.phaseType,
        variables: [],
      };
    }

    // inheritables
    inheritable[node.id] = node.parentId ? inheritable[node.parentId] : { branchNodeIds: [] };
    if ("layout" in node.data) inheritable[node.id].layout = node.data.layout;
    if ("condition" in node.data && node.data.condition) {
      // if a node has a condition, we add a branching rule. The condition is a js script that evaluates to a boolean.
      // the dependencies are the variables used in the condition, and the skips array indices which variables to skip if the condition is true
      branching[node.id] = {
        condition: node.data.condition,
        dependencies: extractConditionDependencies(node.data.condition),
        skips: [],
      };
      // In the inheritables we keep track of all branching nodes, so that we can add all children to the skips array
      inheritable[node.id].branchNodeIds.push(node.id);
    }

    if (node.treeType === "leaf") {
      const variable = prepareVariable(node, annotations, inheritable[node.id].layout);

      for (let branchNodeId of inheritable[node.id].branchNodeIds) {
        if (branching[branchNodeId]) {
          branching[branchNodeId].skips.push(variable.id);
        }
      }

      phases[phase].variables.push(variable);
    }
  }

  // for (let phase of phases) {
  //   phase.done = phase.variables.every((v) => v.done && v.skip);
  //   phase.currentVariable = phase.variables.findIndex((v) => !v.done && !v.skip);
  // }
  // const currentPhase = phases.findIndex((phase) => !phase.done);

  return {
    phases,
    branching,
  };
}

function extractConditionDependencies(evalString: string) {
  // TODO: we need to standardize how variables are referred to in js scripts in the codebook,
  // so that we can extract the dependencies
  return [];
}

function prepareVariable(node: CodebookNode, annotations: Annotation[], layout?: Layout): CodebookVariable {
  if (!("variable" in node.data))
    throw new Error("Leaf nodes must specify a variable. (refactor this, because it should be implicit");

  const variable = node.data.variable;

  const v: CodebookVariable = {
    ...variable,
    name: node.name,
    id: node.id,
    codeMap: {},
  };

  // Infer from annotations whether the variable is done and/or skipped
  // for (let a of annotations) {
  //   if (a.variableId !== node.id) continue;
  //   if (a.deleted) continue;
  //   if (a.finishVariable && a.finishLoop) v.done = true;
  //   if (a.type === "skip") v.skip = true;
  // }

  if ("codes" in v) {
    for (let i = 0; i < v.codes.length; i++) {
      if (v.codes[i].color) v.codes[i].color = standardizeColor(v.codes[i].color);

      v.codeMap[v.codes[i].code] = v.codes[i];
    }
  }

  return v;
}
