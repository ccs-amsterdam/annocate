import { useSyncExternalStore } from "react";
import type { KeyPress } from "./controller";

// The leader key (docs/client.md §4 "Keyboard"): / (on the main keyboard or
// the numpad), then one key for a command, so every command also works with
// one hand on the numpad. / again (or Esc) cancels, and so does waiting
// (`LEADER_TIMEOUT`). A command after the leader is the Ctrl press it stands
// for: / Enter is Ctrl + Enter.

/** The physical keys that are / on a US keyboard and on the numpad. */
const LEADER_CODES = new Set(["Slash", "NumpadDivide"]);

/** How long the leader waits for its command (ms): after that the next key is an ordinary key again. */
export const LEADER_TIMEOUT = 3000;

/**
 * Whether a key press is the leader, without Ctrl, Alt or ⌘: the character
 * / however the keyboard types it (Shift + 7 on a German one), or the
 * physical / key of a US keyboard and of the numpad, whatever it types.
 */
export function isLeader(press: KeyPress): boolean {
  if (press.ctrlKey || press.metaKey || press.altKey) return false;
  return press.key === "/" || LEADER_CODES.has(press.code ?? "");
}

const ctrl = (key: string, code?: string): KeyPress => ({
  key,
  code,
  shiftKey: false,
  altKey: false,
  ctrlKey: true,
  metaKey: false,
});

/**
 * The command a key after the leader gives, as its Ctrl press; null: none.
 * Numpad-shaped: 4 / 6 (or the arrows) back and forward, 0 (or Space) the
 * instruction, Enter continue, 8 / 9 the special answers.
 */
export function leaderCommand(press: KeyPress): KeyPress | null {
  const digit =
    /^(?:Digit|Numpad)([0-9])$/.exec(press.code ?? "")?.[1] ?? (/^[0-9]$/.test(press.key) ? press.key : null);
  if (press.key === "Enter") return ctrl("Enter");
  if (press.key === "ArrowLeft" || digit === "4") return ctrl("ArrowLeft");
  if (press.key === "ArrowRight" || digit === "6") return ctrl("ArrowRight");
  if (press.key === " " || digit === "0") return ctrl(" ");
  if (digit === "8" || digit === "9") return ctrl(digit, `Digit${digit}`);
  return null;
}

/** Keys that don't end the leader (pressed with the next key, e.g. Shift on some layouts). */
export const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock", "NumLock"]);

// Whether the leader was pressed (shown while waiting for the command)
let active = false;
let timeout: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

/** Starts or ends the wait for the leader's command; a wait ends by itself after `LEADER_TIMEOUT`. */
export function setLeader(on: boolean): void {
  if (active === on) return;
  active = on;
  clearTimeout(timeout);
  if (on) timeout = setTimeout(() => setLeader(false), LEADER_TIMEOUT);
  listeners.forEach((l) => l());
}

export const leaderActive = () => active;

export function useLeader(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => active,
    () => false,
  );
}
