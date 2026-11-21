import {
  CHECKABLE_TYPES,
  GOLD_SET,
  OVERLAP_SET,
  PRACTICE_SET,
  type AnyVariableType,
  type DesignItem,
  type SetGroupResponse,
  type UnitLayout,
} from "@annotinder/contracts";
import { type AnswerKeyQuestion } from "../units/AnswerKeyDialog";
import type { ResearcherApi } from "../../../api/httpResearcherApi";

// Shared by the unit loop form's parts: classes, the loop's questions, number fields.

export const selectClass = "h-8 rounded-md border border-input bg-background px-2 text-xs";

export const labelClass = "flex flex-col gap-1 text-xs font-semibold";

/** The names of a loop's questions, in order (through conditions). */
export function questionNames(items: DesignItem[]): string[] {
  return items.flatMap((i) =>
    i.type === "show_if" ? questionNames(i.children as DesignItem[]) : "name" in i ? [i.name] : [],
  );
}

/** A loop's questions with their answer types (through conditions). */
export function questionsOf(items: DesignItem[]): { name: string; variable: AnyVariableType }[] {
  return items.flatMap((i) =>
    i.type === "show_if"
      ? questionsOf(i.children as DesignItem[])
      : "variable" in i
        ? [{ name: i.name, variable: i.variable }]
        : [],
  );
}

/** The loop's questions that gold and practice units can check (compared by value). */
export function checkableQuestions(items: DesignItem[]): AnswerKeyQuestion[] {
  return items.flatMap((i): AnswerKeyQuestion[] => {
    if (i.type === "show_if") return checkableQuestions(i.children as DesignItem[]);
    return "variable" in i && (CHECKABLE_TYPES as readonly string[]).includes(i.variable.type)
      ? [{ name: i.name, variable: i.variable }]
      : [];
  });
}

/** What "Right answers…" needs: the API and the loop's layout. */
export interface AnswerKeyContext {
  client: ResearcherApi;
  layout: UnitLayout;
}

/**
 * The special sets of every set column as one group: practice and gold
 * units of any column are everyone's; the overlap counts here are an upper
 * bound (a session gets those of its own columns).
 */
export function allColumns(groups: SetGroupResponse[]): SetGroupResponse | undefined {
  if (groups.length === 0) return undefined;
  const union = (set: string) => [...new Set(groups.flatMap((g) => g.sets.find((s) => s.name === set)?.unitIds ?? []))];
  return {
    name: "(all set columns)",
    sets: [OVERLAP_SET, PRACTICE_SET, GOLD_SET].map((name) => ({ name, unitIds: union(name), ordered: false })),
  };
}

export const numberOrUndefined = (v: string) => (v === "" ? undefined : Number(v));

/** A range without empty ends; undefined when both are empty. */
export function range(min: number | undefined, max: number | undefined) {
  const out = { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) };
  return Object.keys(out).length ? out : undefined;
}
