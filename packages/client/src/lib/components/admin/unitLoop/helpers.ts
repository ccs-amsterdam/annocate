import {
  supportsAgreement,
  CHECKABLE_TYPES,
  TEST_SET,
  type AnyVariableType,
  type DesignItem,
  type LoopUnits,
  type Placement,
  type SetGroupResponse,
  type TestSetType,
  type UnitLayout,
} from "@annotinder/contracts";
import { type AnswerKeyQuestion } from "../units/AnswerKeyDialog";
import { branchInner } from "../../../codebook/tree";
import type { ResearcherApi } from "../../../api/httpResearcherApi";

// Shared by the unit loop form's parts: classes, the loop's questions, number fields, the test units' summary.

export const selectClass = "h-8 rounded-md border border-input bg-background px-2 text-xs";

export const labelClass = "flex flex-col gap-1 text-xs font-semibold";

/** The names of a loop's questions, in order (through branches). */
export function questionNames(items: DesignItem[]): string[] {
  return items.flatMap((i) => (branchInner(i) ? questionNames(branchInner(i)!) : "name" in i ? [i.name] : []));
}

/** A loop's questions with their answer types (through branches). */
export function questionsOf(items: DesignItem[]): { name: string; variable: AnyVariableType }[] {
  return items.flatMap((i) =>
    branchInner(i) ? questionsOf(branchInner(i)!) : "variable" in i ? [{ name: i.name, variable: i.variable }] : [],
  );
}

/** The loop's questions that gold and practice units can check (compared by value). */
export function checkableQuestions(items: DesignItem[]): AnswerKeyQuestion[] {
  return items.flatMap((i): AnswerKeyQuestion[] => {
    if (branchInner(i)) return checkableQuestions(branchInner(i)!);
    return "variable" in i && (CHECKABLE_TYPES as readonly string[]).includes(i.variable.type)
      ? [{ name: i.name, variable: i.variable }]
      : [];
  });
}

/** The questions of a loop an agreement rule can use: one categorical answer (contracts `supportsAgreement`). */
export function agreeableQuestions(items: DesignItem[]): string[] {
  return items.flatMap((i): string[] => {
    if (branchInner(i)) return agreeableQuestions(branchInner(i)!);
    return i.type === "question" && supportsAgreement(i.variable) ? [i.name] : [];
  });
}

/** What "Right answers…" needs: the API and the loop's layout. */
export interface AnswerKeyContext {
  client: ResearcherApi;
  layout: UnitLayout;
}

export const numberOrUndefined = (v: string) => (v === "" ? undefined : Number(v));

/** A range without empty ends; undefined when both are empty. */
export function range(min: number | undefined, max: number | undefined) {
  const out = { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) };
  return Object.keys(out).length ? out : undefined;
}

const PLACEMENT_WORDS: Record<Placement, string> = {
  spread: "spread",
  before: "before",
  after: "after",
  ignore: "left out",
};

/** How many test units of a type the units have. */
export function testCount(groups: SetGroupResponse[], type: TestSetType): number {
  return groups.find((g) => g.name === TEST_SET)?.sets.find((s) => s.name === type)?.unitIds.length ?? 0;
}

/**
 * The test units settings in a line, for the folded section's header: e.g.
 * "practice before · gold spread · checks: topic".
 */
export function testUnitsSummary(settings: LoopUnits, groups: SetGroupResponse[]): string {
  const types = (["overlap", "practice", "gold"] as const).filter((type) => testCount(groups, type) > 0);
  if (types.length === 0) return "None in the units";
  const kept = (kind: "practice" | "gold") => settings[kind] !== "ignore";
  const checked = new Set([
    ...(kept("practice") ? (settings.practiceCheck?.questions ?? []) : []),
    ...(kept("gold") ? (settings.goldCheck?.questions ?? []) : []),
  ]);
  return [
    settings.coding === false && "only test units",
    ...types.map((type) => `${type} ${PLACEMENT_WORDS[settings[type] ?? "spread"]}`),
    checked.size > 0 && `checks: ${[...checked].join(", ")}`,
    kept("gold") && settings.goldCheck?.health && "health",
  ]
    .filter(Boolean)
    .join(" · ");
}
