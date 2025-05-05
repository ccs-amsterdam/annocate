import { Annotation, CodebookVariable, VariableStatus } from "@/app/types";

export function computeVariableStatuses(variables: CodebookVariable[], annotations: Annotation[]) {
  const variableStatuses: VariableStatus[] = Array(variables.length).fill({ done: false, skip: false });

  for (let i = 0; i < variables.length; i++) {
    const variable = variables[i];

    const varName = topVarName(variable.name);
    for (let a of annotations) {
      if (!a.finishVariable) continue;
      if (topVarName(a.variable) !== varName) continue;

      variableStatuses[i] = "done";
      break;
    }
  }

  let variableIndex = 0;
  for (let i = 1; i < variables.length; i++) {
    const prev = variableStatuses[i - 1];
    const current = variableStatuses[i];
    if ((prev === "done" || prev === "skip") && current === "pending") variableIndex = i;
    break;
  }

  return { variableStatuses: variableStatuses, variableIndex };
}

export function topVarName(variable: string) {
  return variable.split(".")[0];
}
