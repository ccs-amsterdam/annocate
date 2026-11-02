/**
 * Right answers of gold and practice units (docs/plans/special-sets.md):
 * the cell of a unit's answer column (`<question>_gold`, `<question>_practice`).
 *
 * | Cell                | Right when the answer is                      |
 * | ------------------- | --------------------------------------------- |
 * | `positive`          | exactly this value                            |
 * | `a;b`               | exactly these values together (multiple)      |
 * | `positive\|neutral` | any of the alternatives                       |
 * | `3..5`              | a number from 3 to 5 (numeric)                |
 *
 * Alternatives combine: `a;b|c` is right for "a and b" and for "c".
 * Gold cells are checked on the server and never reach coders; practice
 * cells come with practice units and are checked in the browser, as each
 * question is answered (special-sets.md §2).
 */

export type AnswerAlternative = { values: string[] } | { range: [number, number] };

/** A cell as alternatives; null when empty (the unit isn't checked for this question). */
export function parseAnswerKey(cell: unknown): AnswerAlternative[] | null {
  if (cell === null || cell === undefined) return null;
  const alternatives: AnswerAlternative[] = [];
  for (const raw of String(cell).split("|")) {
    const text = raw.trim();
    if (!text) continue;
    const range = /^(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)$/.exec(text);
    if (range) {
      const [lo, hi] = [Number(range[1]), Number(range[2])];
      alternatives.push({ range: lo <= hi ? [lo, hi] : [hi, lo] });
      continue;
    }
    const values = text
      .split(";")
      .map((v) => v.trim())
      .filter(Boolean);
    if (values.length > 0) alternatives.push({ values });
  }
  return alternatives.length > 0 ? alternatives : null;
}

/** Whether the given values (as strings) match one of the alternatives. */
export function matchesAnswerKey(key: AnswerAlternative[], given: string[]): boolean {
  return key.some((alt) => {
    if ("range" in alt) {
      if (given.length !== 1 || given[0].trim() === "") return false;
      const n = Number(given[0]);
      return Number.isFinite(n) && n >= alt.range[0] && n <= alt.range[1];
    }
    return given.length === alt.values.length && alt.values.every((v) => given.some((g) => sameValue(g, v)));
  });
}

/** Equal as text, or as numbers (`3` and `3.0`). */
function sameValue(a: string, b: string): boolean {
  if (a === b) return true;
  const [x, y] = [Number(a), Number(b)];
  return a.trim() !== "" && b.trim() !== "" && Number.isFinite(x) && Number.isFinite(y) && x === y;
}

/** Whether an answer (a question's value) matches a key; a skipped or missing answer never does. */
export function answerMatchesKey(answer: { skip?: boolean; values?: { value: unknown }[] } | undefined, key: AnswerAlternative[]): boolean {
  if (!answer || answer.skip) return false;
  return matchesAnswerKey(key, (answer.values ?? []).map((v) => String(v.value)));
}

/** A cell written back from alternatives (the inverse of parseAnswerKey). */
export function formatAnswerKey(key: AnswerAlternative[]): string {
  return key.map((alt) => ("range" in alt ? `${alt.range[0]}..${alt.range[1]}` : alt.values.join(";"))).join("|");
}

/**
 * What in a cell can never be right for its question (for warnings): a value
 * that isn't one of the options (or, for a numeric question, not a number),
 * a range no option value falls in (e.g. on unordered text options), or a
 * range outside a numeric question's min..max. Empty: fine.
 */
export function answerKeyProblems(
  key: AnswerAlternative[],
  question: { type: string; options?: { value: unknown }[]; min?: number; max?: number } | undefined,
): string[] {
  if (!question) return [];
  const options = question.options?.map((o) => String(o.value));
  const numeric = question.type === "numeric";
  return key.flatMap((alt) => {
    if ("range" in alt) {
      const [lo, hi] = alt.range;
      const text = `${lo}..${hi}`;
      if (options) return options.some((o) => o.trim() !== "" && Number(o) >= lo && Number(o) <= hi) ? [] : [`${text} (no option in this range)`];
      if (numeric && ((question.min !== undefined && hi < question.min) || (question.max !== undefined && lo > question.max)))
        return [`${text} (outside ${question.min ?? ""}..${question.max ?? ""})`];
      return [];
    }
    return alt.values.flatMap((v) => {
      if (options) return options.some((o) => sameValue(o, v)) ? [] : [`${v} (not an option)`];
      if (numeric) {
        const n = Number(v);
        if (v.trim() === "" || !Number.isFinite(n)) return [`${v} (not a number)`];
        if ((question.min !== undefined && n < question.min) || (question.max !== undefined && n > question.max)) return [`${v} (outside ${question.min ?? ""}..${question.max ?? ""})`];
      }
      return [];
    });
  });
}
