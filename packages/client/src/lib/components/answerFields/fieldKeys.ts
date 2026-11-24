// Keys of answer fields that are decided outside the keyboard's scopes:
// typing in a text answer, and the numbers of the spans on a clicked word.

/** What a text answer reads of a key press in its box. */
export interface TextKey {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  isComposing: boolean;
  /** 229 while an input method composes (Safari ends the composition before its Enter). */
  keyCode: number;
}

/**
 * Whether a key press in a text answer continues: Enter in one line (Shift +
 * Enter doesn't), Ctrl (or ⌘) + Enter in a text area. Never the Enter that
 * confirms an input method's composition (Chinese, Japanese, Korean).
 */
export function continuesText(press: TextKey, multiline: boolean): boolean {
  if (press.key !== "Enter" || press.isComposing || press.keyCode === 229) return false;
  return multiline ? press.ctrlKey || press.metaKey : !press.shiftKey;
}

/** The number key of a span in the menu of the spans on a clicked word (1 to 9); null: none, or answers take no keys. */
export function spanKey(index: number, answerKeys: boolean): string | null {
  return answerKeys && index < 9 ? String(index + 1) : null;
}

/** The span a key opens in that menu (its index); -1: none. */
export function spanOfKey(key: string, count: number, answerKeys: boolean): number {
  if (!answerKeys || !/^[1-9]$/.test(key)) return -1;
  const index = Number(key) - 1;
  return index < count ? index : -1;
}
