import type { SpecialKind } from "@annotinder/contracts";
import type { KeyPress } from "./controller";

// The command keys (docs/client.md §4 "Keyboard"): with Ctrl, or after the
// leader key / (leader.ts), so they never clash with answering, typing a
// number or text, filtering, or a keyboard layout. Always on, whatever the
// shortcut style (or none). On a Mac Ctrl + arrows can belong to the
// system: Option (Alt) + arrows work too.

/** Ctrl (or ⌘) + Enter: continue, done (also in a text box, where Enter is a new line). */
export const isContinue = (press: KeyPress) => press.key === "Enter" && (press.ctrlKey || press.metaKey);

/** Ctrl (or Alt) + Left: the previous question. */
export const isBack = (press: KeyPress) => press.key === "ArrowLeft" && (press.ctrlKey || press.altKey);

/** Ctrl (or Alt) + Right: the next question. */
export const isForward = (press: KeyPress) => press.key === "ArrowRight" && (press.ctrlKey || press.altKey);

/** Ctrl + Space: the question's instruction. */
export const isHelp = (press: KeyPress) => press.key === " " && press.ctrlKey;

/**
 * A question's special answers by a fixed key, after the leader (`/ 8`):
 * 8 don't know and 9 not applicable, as the codes surveys use (88, 99).
 */
export const SPECIAL_KEYS = { dont_know: "8", not_applicable: "9" } as const satisfies Record<SpecialKind, string>;

/** The special answer a command press chooses (the leader's 8 or 9, as Ctrl + 8 / 9), else null. */
export function specialOfPress(press: KeyPress): SpecialKind | null {
  if (!(press.ctrlKey || press.metaKey) || press.altKey || press.shiftKey) return null;
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(press.code ?? "")?.[1] ?? press.key;
  const found = Object.entries(SPECIAL_KEYS).find(([, key]) => key === digit);
  return found ? (found[0] as SpecialKind) : null;
}

/** The badge of a special answer's key: /8, /9. */
export const specialBadge = (kind: SpecialKind) => `/${SPECIAL_KEYS[kind]}`;

/** How the badges show them: ^ for Ctrl (symbols only, so a button's name stays its own). */
export const COMMAND_BADGES = { continue: "^↵", back: "^←", forward: "^→", help: "^␣" } as const;
