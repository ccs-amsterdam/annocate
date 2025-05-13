import {
  Annotation,
  CodebookPhase,
  JobManagerState,
  CodebookVariable,
  GetSession,
  ProgressState,
  VariableAnnotationsMap,
  Branching,
  UpdateTrigger,
} from "@/app/types";

export async function computeProgress(
  phases: CodebookPhase[],
  globalAnnotations: VariableAnnotationsMap,
  unitProgress: GetSession["phaseProgress"],
) {
  const progress: ProgressState = {
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

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i];
    const variables = computeVariableStatuses(globalAnnotations, phase);
    const unitsDone = computeUnitsDone(unitProgress, phase);

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
