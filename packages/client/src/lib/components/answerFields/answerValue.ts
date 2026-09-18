import type { VariableValue } from "@annotinder/contracts";

export interface CodeSelection {
  code: string;
  item?: string;
  value?: number;
}

export function buildCodeValue(selections: CodeSelection[]): VariableValue {
  return {
    done: true,
    skip: false,
    codes: selections.map((selection) => ({
      code: selection.code,
      item: selection.item,
      value: selection.value,
    })),
  };
}

export function buildSkipValue(): VariableValue {
  return { done: true, skip: true };
}
