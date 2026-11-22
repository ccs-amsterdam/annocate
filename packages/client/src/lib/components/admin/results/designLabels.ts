import { useMemo } from "react";
import {
  collectQuestions,
  loopTitle,
  optionLabel,
  unitLoops,
  type AnyVariableType,
  type TopLevelItem,
} from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useDeploymentQuery, useDesignVersionQuery } from "../../../admin/queries";

/** What the results views show for names and values: the deployed design's texts. */
export interface DesignLabels {
  loopTitle: (key: string | null) => string;
  questionText: (name: string) => string;
  /** The option's label (or a scale item's), else the value as is. */
  valueLabel: (question: string, value: string | number) => string;
  itemLabel: (question: string, item: string) => string;
  /** The question's options in design order (values), if it has options. */
  options: (question: string) => (string | number)[];
}

/** Labels from the deployed design version (none while loading: names and values as they are). */
export function useDesignLabels(client: ResearcherApi): DesignLabels {
  const deployment = useDeploymentQuery(client).data;
  const design = useDesignVersionQuery(client, deployment?.designVersionId ?? null).data;
  return useMemo(() => {
    const items = (design?.items ?? []) as TopLevelItem[];
    const { questions } = collectQuestions(items);
    const loops = new Map(unitLoops(items).map(({ key, loop }) => [key, loopTitle(loop, key)]));
    const optionsOf = (name: string): { value: string | number; label?: string }[] => {
      const type: AnyVariableType | undefined = questions.get(name);
      return type && "options" in type && Array.isArray(type.options) ? type.options : [];
    };
    return {
      loopTitle: (key) => (key === null ? "Questions" : (loops.get(key) ?? `Loop ${key}`)),
      questionText: (name) => {
        const type = questions.get(name);
        return type && "question" in type && typeof type.question === "string" ? type.question : "";
      },
      valueLabel: (question, value) => {
        const option = optionsOf(question).find((o) => o.value === value);
        return option ? optionLabel(option) : String(value);
      },
      itemLabel: (question, item) => {
        const type = questions.get(question);
        const found = type?.type === "scale" ? type.items.find((i) => i.name === item) : undefined;
        return found?.label || item;
      },
      options: (question) => optionsOf(question).map((o) => o.value),
    };
  }, [design]);
}
