import {
  Annotation,
  Branching,
  CodebookNode,
  CodebookPhase,
  CodebookState,
  CodebookVariable,
  GetSession,
  Layout,
  Layouts,
  Phase,
  ProgressState,
  UpdateTrigger,
  VariableAnnotationsMap,
  VariableMap,
  VariableSchema,
} from "@/app/types";
import standardizeColor from "./standardizeColor";
import { computeProgress } from "./computeProgress";

export async function prepareCodebookState(
  nodes: CodebookNode[],
  globalAnnotations: VariableAnnotationsMap,
  unitProgress: GetSession["phaseProgress"],
): Promise<CodebookState> {
  const phases: CodebookPhase[] = [];
  const updateTrigger: UpdateTrigger = {
    variableNameMap: {},
    dependencies: {},
  };
  const branching: Branching = {};
  const variableMap: VariableMap = {};
  const layouts: Layouts = {};

  // inheritables
  // - A node inherits the layout of its parent, unless it specifies a new layout
  // - If a node is skipped, all its children are skipped
  let inheritable: Record<number, { layoutId?: number; branchNodeIds: number[] }> = {};

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
    if ("layout" in node.data) {
      const layoutId = node.id;
      layouts[layoutId] = await prepareLayout(node.data.layout);
      inheritable[node.id].layoutId = layoutId;
    }

    if ("condition" in node.data && node.data.condition) {
      // if a node has a condition, we add a branching rule. The condition is a js script that evaluates to a boolean.
      // the dependencies are the variables used in the condition, and the skips array indices which variables to skip if the condition is true
      branching[node.id] = {
        condition: node.data.condition,
        skips: [],
      };

      // In the inheritables we keep track of all branching nodes, so that we can add all children to the skips array
      inheritable[node.id].branchNodeIds.push(node.id);
    }

    if (node.treeType === "leaf") {
      updateTrigger.variableNameMap[node.name] = node.id;
      const variable = await prepareVariable(node, inheritable[node.id].layoutId);
      variableMap[variable.id] = variable;

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
  //
  //
  for (let variable of Object.values(variableMap)) {
  }

  return {
    progress: await computeProgress(phases, globalAnnotations, unitProgress),
    branching,
    layouts,
    variableMap,
  };
}

async function prepareLayout(layout: Layout): Promise<Layout> {
  return layout;
}

async function prepareVariable(node: CodebookNode, layoutId?: number): Promise<CodebookVariable> {
  if (!("variable" in node.data))
    throw new Error("Leaf nodes must specify a variable. (refactor this, because it should be implicit");

  const variable = node.data.variable;

  const v: CodebookVariable = {
    ...variable,
    name: node.name,
    id: node.id,
    codeMap: {},
    layoutId,
  };

  if ("codes" in v) {
    for (let i = 0; i < v.codes.length; i++) {
      if (v.codes[i].color) v.codes[i].color = standardizeColor(v.codes[i].color);

      v.codeMap[v.codes[i].code] = v.codes[i];
    }
  }

  return v;
}
