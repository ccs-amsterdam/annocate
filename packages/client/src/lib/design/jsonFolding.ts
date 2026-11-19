/** Lines that open a "variable" or "layout" object: the details "Fold details" collapses. */
const FOLD_LINE_REGEX = /^\s*"(variable|layout)":\s*\{\s*$/;

/** 1-based numbers of the lines that open a foldable "variable" or "layout" object. */
export function getFoldableLineNumbers(text: string): number[] {
  return text.split("\n").flatMap((line, i) => (FOLD_LINE_REGEX.test(line) ? [i + 1] : []));
}
