import {
  Annotation,
  Branching,
  CodebookNode,
  CodebookPhase,
  JobManagerState,
  CodebookVariable,
  DataIndicator,
  Dependencies,
  GetSession,
  Layout,
  Layouts,
  UpdateTrigger,
  VariableAnnotationsMap,
  VariableMap,
  VariableSchema,
  Unit,
  Content,
  Contents,
  AnnotationLibrary,
  UpdateData,
  CodebookNodeResponse,
  SandboxContext,
} from "@/app/types";
import standardizeColor from "../standardizeColor";
import { computeProgress } from "./computeProgress";
import { createAnnotationLibrary } from "./computeAnnotationLibrary";
import { createVariableMap, createVariable } from "./computeVariableMap";
import { computeUpdateData } from "./computeUpdateData";
import { uniqueArray } from "../utils";
import { M_PLUS_1 } from "next/font/google";
import { prepareCodebook } from "../treeFunctions";

export async function initializeJobManagerState(
  codebook: CodebookNodeResponse[],
  globalAnnotations: VariableAnnotationsMap,
  unitProgress: GetSession["phaseProgress"],
  sandbox: SandboxContext,
  // sandboxedEval
): Promise<JobManagerState> {
  const unit = null;
  const error = null;
  const nodes = prepareCodebook(codebook);
  const phases = await computeCodebookPhases(nodes);
  const variableMap = createVariableMap(phases.flatMap((phase) => phase.variables));
  const progress = await computeProgress(phases, globalAnnotations, unitProgress);
  const annotationLib = createAnnotationLibrary(null, variableMap, globalAnnotations);
  const updateData = computeUpdateData(nodes);
  const contents: Contents = {};

  // evaluate branching rules to update globalAnnotations
  // (optional, because 'should' be the same as on the server)

  return {
    unit,
    annotationLib,
    progress,
    contents,
    variableMap,
    updateData,
    error,
    sandbox,
  };
}

async function computeCodebookPhases(nodes: CodebookNode[]) {
  const phases: CodebookPhase[] = [];

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
      inheritable[node.id].layoutId = node.id;
    }

    if ("condition" in node.data && node.data.condition) {
      // In the inheritables we keep track of all branching nodes, so that we can add all children to the skips array
      inheritable[node.id].branchNodeIds.push(node.id);
    }

    if (node.treeType === "variable") {
      const variable = await createVariable(node, inheritable[node.id].layoutId);
      phases[phase].variables.push(variable);
    }
  }

  return phases;
}

async function updateJobManagerState(jobManagerState: JobManagerState, triggerIds: number[]) {
  // note that the state properties need to change in order to trigger a re-render
  const newState = { ...jobManagerState };

  const triggerActivations = new Set(triggerIds);
  // Dealing with recursive changes
  // - Some updates add new triggers. Like skipping a variable that sets another condition to false
  // - Since updates always happen after the trigger, we can just add the new triggers to the triggerActivations

  // An updateNode + property can have multiple triggers, but we only need to update once
  const alreadyUpdated: Record<number, Set<string>> = {};

  // triggers are sorted by update node
  for (let updateTrigger of newState.updateData.triggers) {
    if (updateTrigger.triggerPosition >= updateTrigger.updatePosition) continue;
    if (!triggerActivations.has(updateTrigger.updateId)) continue;

    // skip if the update is already performed
    if (!alreadyUpdated[updateTrigger.updateId]) alreadyUpdated[updateTrigger.updateId] = new Set<string>();
    if (alreadyUpdated[updateTrigger.updateId].has(updateTrigger.updateProperty)) continue;
    alreadyUpdated[updateTrigger.updateId].add(updateTrigger.updateProperty);

    const recursiveTriggers = await updateProperty(updateTrigger, newState);
    recursiveTriggers.forEach((triggerId) => triggerActivations.add(triggerId));
  }
}

async function updateProperty(trigger: UpdateTrigger, newState: JobManagerState): Promise<number[]> {
  return [];
}

async function updateProgress() {}

async function prepareContent(layout: Layout, unit?: Unit): Promise<Content | null> {
  if (!unit) return null;
  return null;
}
