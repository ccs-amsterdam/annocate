import { createContext, useContext } from "react";
import { collectQuestions, type DesignItem } from "@annotinder/contracts";

// The answer values of the deployed design, per question: once coders may
// have given a value, editing its option's label in a draft doesn't change
// the value with it (OptionsEditor), so answers keep meaning the same.

const EMPTY: ReadonlySet<string> = new Set();

/** Question name -> its options' values (as text) in the deployed design version. */
export function deployedOptionValues(items: readonly DesignItem[] | null): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  if (!items) return out;
  for (const [name, variable] of collectQuestions(items as DesignItem[]).questions) {
    const options = "options" in variable && Array.isArray(variable.options) ? variable.options : [];
    out.set(name, new Set(options.map((o: { value: unknown }) => String(o.value))));
  }
  return out;
}

/** The deployed values of every question (provided by the design editor). */
export const DeployedValuesContext = createContext<ReadonlyMap<string, ReadonlySet<string>>>(new Map());
/** The question being edited (provided by its form). */
export const EditedQuestionContext = createContext<string | null>(null);

/** The deployed values of the question being edited (none for a new question, or nothing deployed). */
export function useDeployedOptionValues(): ReadonlySet<string> {
  const question = useContext(EditedQuestionContext);
  const values = useContext(DeployedValuesContext);
  return (question !== null && values.get(question)) || EMPTY;
}
