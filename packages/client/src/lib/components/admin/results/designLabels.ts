import { useMemo } from "react";
import {
  collectQuestions,
  loopTitle,
  optionLabel,
  unitLoops,
  type AnyVariableType,
  type TopLevelItem,
  type UnitLayout,
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
  /** The deployed design's questions. */
  questions: ReadonlyMap<string, AnyVariableType>;
  /** A loop's unit layout and its questions in design order. */
  loop: (key: string) => { layout: UnitLayout; questions: string[] } | undefined;
}

/** Labels from the deployed design version (none while loading: names and values as they are). */
export function useDesignLabels(client: ResearcherApi): DesignLabels {
  const deployment = useDeploymentQuery(client).data;
  const design = useDesignVersionQuery(client, deployment?.designVersionId ?? null).data;
  return useMemo(() => {
    const items = (design?.items ?? []) as TopLevelItem[];
    const { questions, loopOf } = collectQuestions(items);
    const designLoops = unitLoops(items);
    const loops = new Map(designLoops.map(({ key, loop }) => [key, loopTitle(loop, key)]));
    const layouts = new Map(designLoops.map(({ key, loop }) => [key, loop.layout]));
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
      questions,
      loop: (key) => {
        const layout = layouts.get(key);
        return layout && { layout, questions: [...loopOf].filter(([, l]) => l === key).map(([name]) => name) };
      },
    };
  }, [design]);
}
