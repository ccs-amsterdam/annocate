import {
  Annotation,
  CodebookPhase,
  JobManagerState,
  CodebookVariable,
  GetSession,
  ProgressState,
  VariableAnnotationsMap,
  UpdateTrigger,
  CodebookNode,
} from "@/app/types";

export async function createProgress(nodes: CodebookNode[], session: GetSession) {
  const progress: ProgressState = initProgress();
  const phases = groupVariablesByPhase(nodes);

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const variables = computeVariableStatuses(session.globalAnnotations, phase);
    const unitsDone = computeUnitsDone(session.phaseProgress, phase);

    progress.phases[i] = {
      unitsDone,
      variables,
      done: unitsDone.every((u) => u),
      type: phase.type,
    };
  }

  progress.current.phase = progress.phases.findIndex((phase) => !phase.done);
  progress.current.unit = progress.phases[progress.current.phase].unitsDone.findIndex((u) => u);
  progress.current.variable = progress.phases[progress.current.phase].variables.findIndex((v) => !v.done && !v.skip);
  return progress;
}

function groupVariablesByPhase(nodes: CodebookNode[]) {
  const phases: CodebookPhase[] = [];

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

    if (node.treeType === "variable") {
      phases[phase].variables.push(node);
    }
  }

  return phases;
}

function computeVariableStatuses(variableAnnotationsMap: VariableAnnotationsMap, phase: CodebookPhase) {
  return phase.variables.map((variable) => ({
    id: variable.id,
    label: variable.name,
    done: variableAnnotationsMap[variable.id]?.done || false,
    skip: variableAnnotationsMap[variable.id]?.skip || false,
  }));
}

function computeUnitsDone(unitProgress: GetSession["phaseProgress"], phase: CodebookPhase) {
  const unitsDone = unitProgress.find((up) => up.phaseId === phase.id)?.unitsDone;
  if (!unitsDone) throw new Error("invalid GetSession: missing unitsDone for phase " + phase.id);
  return unitsDone;
}

function updateProgress(state: JobManagerState): { progress: ProgressState; updateTriggers: UpdateTrigger[] } {
  const progress = state.progress;
  return { progress, updateTriggers: [] };
}

function initProgress() {
  return {
    current: {
      phase: 0,
      unit: 0,
      variable: 0,
    },
    previous: {
      phase: 0,
      unit: 0,
      variable: 0,
    },
    phases: [],
    settings: {
      canGoBack: true,
      canSkip: false,
    },
  };
}
