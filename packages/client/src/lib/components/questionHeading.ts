// How a question's text is shown (docs/client.md §4 "Questions and
// instructions"): a short question of one paragraph as a heading; anything
// else (headings, lists, several paragraphs, a long text) as the markdown it
// is, so researchers who write markdown style it themselves.

/** The longest question shown as a heading (characters of its source). */
export const HEADING_MAX = 150;

/** Whether a question's text is a short single paragraph: shown as a heading. */
export function isHeadingQuestion(source: string): boolean {
  const text = source.trim();
  if (text.length === 0 || text.length > HEADING_MAX) return false;
  if (/\n\s*\n/.test(text)) return false;
  // A line that starts a block: a heading, list, quote, table, fenced or ::: block
  return !text.split("\n").some((line) => /^\s*(#|[-*+]\s|\d+[.)]\s|>|\||```|:::)/.test(line));
}
