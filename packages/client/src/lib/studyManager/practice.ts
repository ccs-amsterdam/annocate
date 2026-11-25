import type { AnswerAlternative, AnyVariableType, CoderUnitResponse, VariableValue } from "@annotinder/contracts";
import { answerMatchesKey, parseAnswerKey } from "@annotinder/contracts";

// Practice units (docs/architecture.md §6.2): a question with a check is
// checked as it is answered.

/** How a practice answer did: right, or wrong against this key. */
export type PracticeResult = { right: true } | { right: false; key: AnswerAlternative[] };

/** What the coder's practice answers were checked against, and how they did, for one visit. */
export class PracticeChecks {
  /** Tries per practice question until right, by unit id and question (stored with the answer's timing). */
  private tries = new Map<number, Map<string, number>>();
  /** Practice questions answered right (or gone on from), by `<unitId>:<question>`: checked once. */
  private solved = new Set<string>();
  /** Practice questions whose answer so far is wrong, by `<unitId>:<question>`: not answered yet. */
  private wrong = new Set<string>();

  /**
   * Checks an answer to a practice unit's question, and counts the try.
   * Null: nothing to check (no check on this question, or it was answered
   * right or gone on from before).
   */
  check(unit: CoderUnitResponse, name: string, value: VariableValue): PracticeResult | null {
    const check = unit.practice?.questions[name];
    const key = check ? parseAnswerKey(check.key) : null;
    const id = `${unit.id}:${name}`;
    if (!key || this.solved.has(id)) return null;
    this.countTry(unit.id, name);
    if (!answerMatchesKey(value, key)) {
      this.wrong.add(id);
      return { right: false, key };
    }
    this.solve(unit.id, name);
    return { right: true };
  }

  /** A wrong answer isn't an answer yet: the coder can't go past the question. */
  isWrong(unitId: number | undefined, name: string): boolean {
    return this.wrong.has(`${unitId}:${name}`);
  }

  /** Answered right, or the coder goes on from the feedback with their answer: not checked again. */
  solve(unitId: number, name: string): void {
    this.solved.add(`${unitId}:${name}`);
    this.wrong.delete(`${unitId}:${name}`);
  }

  /** How many tries each question of a unit took (1: right the first time): given once, when the unit is saved. */
  takeTries(unitId: number): Map<string, number> {
    const tries = this.tries.get(unitId) ?? new Map<string, number>();
    this.tries.delete(unitId);
    return tries;
  }

  private countTry(unitId: number, name: string): void {
    const tries = this.tries.get(unitId) ?? new Map<string, number>();
    tries.set(name, (tries.get(name) ?? 0) + 1);
    this.tries.set(unitId, tries);
  }
}

/**
 * The default feedback on a wrong practice answer, when the practice unit
 * gives no message: `The expected answer to "…" is …`, with the options'
 * labels.
 */
export function expectedAnswerText(
  name: string,
  variable: AnyVariableType | undefined,
  key: AnswerAlternative[],
): string {
  const question = variable as { question?: string; options?: { value: unknown; label?: string }[] } | undefined;
  const label = (value: string) => question?.options?.find((o) => String(o.value) === value)?.label ?? value;
  const right = key.map((alt) =>
    "range" in alt ? `between ${alt.range[0]} and ${alt.range[1]}` : alt.values.map(label).join(" and "),
  );
  const text = question?.question ? `"${question.question}"` : name;
  return `The expected answer to ${text} is ${right.join(" or ")}.`;
}
