import {
  JobManagerState,
  GetSession,
  Layout,
  UpdateTrigger,
  Unit,
  Content,
  Contents,
  SandboxContext,
} from "@/app/types";
import { createProgress } from "./computeProgress";
import { createAnnotationLibrary } from "./computeAnnotationLibrary";
import { createVariableMap } from "./computeVariableMap";
import { computeUpdateData as createUpdateData } from "./computeUpdateData";
import { prepareCodebook } from "../treeFunctions";

export async function initializeJobManagerState(
  session: GetSession,
  sandbox: SandboxContext,
  // sandboxedEval
): Promise<JobManagerState> {
  const unit = null;
  const error = null;
  const nodes = prepareCodebook(session.codebook);
  const variableMap = await createVariableMap(nodes);
  const progress = await createProgress(nodes, session);
  const annotationLib = createAnnotationLibrary(null, variableMap, session.globalAnnotations);
  const updateData = createUpdateData(nodes);
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
