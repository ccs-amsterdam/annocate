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
 * Checked on the server; coders never get the cells.
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
    return given.length === alt.values.length && alt.values.every((v) => given.includes(v));
  });
}

/** A cell written back from alternatives (the inverse of parseAnswerKey). */
export function formatAnswerKey(key: AnswerAlternative[]): string {
  return key.map((alt) => ("range" in alt ? `${alt.range[0]}..${alt.range[1]}` : alt.values.join(";"))).join("|");
}

/**
 * Values in a cell that aren't options of the question (for warnings).
 * `options` absent: any value goes (numeric, confirm).
 */
export function unknownAnswerValues(key: AnswerAlternative[], options: string[] | undefined): string[] {
  if (!options) return [];
  return key.flatMap((alt) => ("values" in alt ? alt.values.filter((v) => !options.includes(v)) : [`${alt.range[0]}..${alt.range[1]}`]));
}
