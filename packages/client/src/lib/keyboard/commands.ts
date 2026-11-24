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

/** How the badges show them. */
export const COMMAND_BADGES = { continue: "Ctrl ↵", back: "Ctrl ←", forward: "Ctrl →", help: "Ctrl ␣" } as const;
