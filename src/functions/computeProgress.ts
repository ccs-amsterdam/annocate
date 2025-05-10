import { Annotation, CodebookPhase, CodebookState, CodebookVariable, GetSession, ProgressState } from "@/app/types";

export async function computeProgress(
  codebookState: CodebookState,
  globalAnnotations: Annotation[],
  unitProgress: GetSession["phaseProgress"],
) {
  const progress: ProgressState = {
    currentPhase: 0,
    phases: [],
    settings: {
      canGoBack: true,
      canSkip: false,
    },
  };

  for (let i = 0; i < codebookState.phases.length; i++) {
    const phase = codebookState.phases[i];
    const variables = computeVariableStatuses(globalAnnotations, phase);

    const unitsDone = computeUnitsDone(unitProgress, phase);
    const currentUnit = unitsDone.findIndex((u) => u);
    const currentVariable = variables.findIndex((v) => !v.done && !v.skip);
    progress.phases[i] = {
      currentUnit: currentUnit > -1 ? currentUnit : unitsDone.length - 1,
      unitsDone,
      currentVariable: currentVariable > -1 ? currentVariable : variables.length - 1,
      previousVariable: 0,
      variables,
      done: unitsDone.every((u) => u),
    };
  }

  progress.currentPhase = progress.phases.findIndex((phase) => !phase.done);
  return progress;
}

function computeVariableStatuses(annotations: Annotation[], phase: CodebookPhase) {
  const variables = phase.variables;
  return phase.variables.map((variable) => computeVariableStatus(annotations, variable));
}

function computeVariableStatus(annotations: Annotation[], variable: CodebookVariable) {
  let done = false;
  let skip = false;
  for (let a of annotations) {
    if (a.deleted) continue;
    if (a.variableId !== variable.id) continue;
    if (!a.finishVariable || !a.finishLoop) continue;
    if (a.type === "skip") skip = true;
    done = true;
    break;
  }
  return {
    id: variable.id,
    label: variable.name,
    done,
    skip,
  };
}

function computeUnitsDone(unitProgress: GetSession["phaseProgress"], phase: CodebookPhase) {
  const unitsDone = unitProgress.find((up) => up.phaseId === phase.id)?.unitsDone;
  if (!unitsDone) throw new Error("invalid GetSession: missing unitsDone for phase " + phase.id);
  return unitsDone;
}
