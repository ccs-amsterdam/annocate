import type { KeyPress } from "./controller";

// The command keys (docs/client.md §4 "Keyboard"): with Ctrl, so they never
// clash with answering, typing a number or text, filtering, or a keyboard
// layout. Always on, whatever the shortcut style (or none). On a Mac Ctrl +
// arrows can belong to the system: Option (Alt) + arrows work too.

/** Ctrl (or ⌘) + Enter: continue, done (also in a text box, where Enter is a new line). */
export const isContinue = (press: KeyPress) => press.key === "Enter" && (press.ctrlKey || press.metaKey);

/** Ctrl (or Alt) + Left: the previous question. */
export const isBack = (press: KeyPress) => press.key === "ArrowLeft" && (press.ctrlKey || press.altKey);

/** Ctrl (or Alt) + Right: the next question. */
export const isForward = (press: KeyPress) => press.key === "ArrowRight" && (press.ctrlKey || press.altKey);

/** Ctrl + Space: the question's instruction. */
export const isHelp = (press: KeyPress) => press.key === " " && press.ctrlKey;

/**
 * Ctrl (or ⌘) + 1, 2, ...: a question's special answers (don't know, not
 * applicable), in the order the question lists them. The index, or -1. By
 * the physical key, so layouts that type digits with Shift (AZERTY) work.
 */
export function specialIndex(press: KeyPress): number {
  if (!(press.ctrlKey || press.metaKey) || press.altKey || press.shiftKey) return -1;
  const digit =
    /^(?:Digit|Numpad)([1-9])$/.exec(press.code ?? "")?.[1] ?? (/^[1-9]$/.test(press.key) ? press.key : null);
  return digit ? Number(digit) - 1 : -1;
}

/** The badge of the `index`-th special answer: ^1, ^2, ... */
export const specialBadge = (index: number) => `^${index + 1}`;

/** How the badges show them: ^ for Ctrl (symbols only, so a button's name stays its own). */
export const COMMAND_BADGES = { continue: "^↵", back: "^←", forward: "^→", help: "^␣" } as const;
