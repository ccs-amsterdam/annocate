import { inTextField, type KeyController, type KeyPress } from "./controller";
import { isLeader, leaderActive, leaderCommand, MODIFIER_KEYS, setLeader } from "./leader";

/** What the keyboard reads of a key press on window (a `KeyboardEvent`). */
export interface KeyDown extends KeyPress {
  repeat: boolean;
  isComposing: boolean;
  defaultPrevented: boolean;
  target: EventTarget | null;
  preventDefault(): void;
}

/** Whether a key's target is a control the browser activates with Space or Enter. */
function activates(target: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) return false;
  return !!target.closest("button, [role=radio], [role=button], a[href]");
}

/** A number's box: typing there has no /, so the leader works in it. */
function numberInput(target: EventTarget | null): boolean {
  return typeof HTMLInputElement !== "undefined" && target instanceof HTMLInputElement && target.type === "number";
}

/** A first press (not a repeat): whether the keyboard used it. */
function firstPress(controller: KeyController, event: KeyDown): boolean {
  // After the leader (/): the next key is a command, as its Ctrl press; / again or Esc cancels
  if (leaderActive()) {
    if (MODIFIER_KEYS.has(event.key)) return false;
    setLeader(false);
    const command = isLeader(event) || event.key === "Escape" ? null : leaderCommand(event);
    if (command) controller.dispatch(command);
    return true;
  }
  // The leader: not while typing text (a number's box takes no /)
  if (isLeader(event) && (!inTextField(event.target) || numberInput(event.target))) {
    setLeader(true);
    return true;
  }
  if (inTextField(event.target)) return false;
  // Space and Enter on a focused button choose it (the browser clicks it), unless a scope needs them (typed filter)
  if ((event.key === " " || event.key === "Enter") && activates(event.target)) {
    return controller.dispatch({
      key: event.key,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      onControl: true,
    });
  }
  return controller.dispatch(event);
}

/**
 * The coding screen's answer to key presses: each first press is offered to
 * the leader and the controller's scopes, and is the browser's when none
 * uses it. A held-down key chooses once: its repeats are dropped when the
 * first press was used, and the browser's otherwise (holding ↓, Space or
 * PageDown scrolls).
 */
export function keyDownHandler(controller: KeyController): (event: KeyDown) => void {
  // The keys whose latest first press was used
  const used = new Set<string>();
  return (event) => {
    if (event.defaultPrevented || event.isComposing) return;
    const held = event.code || event.key;
    if (event.repeat) {
      if (used.has(held)) event.preventDefault();
      return;
    }
    if (firstPress(controller, event)) {
      used.add(held);
      event.preventDefault();
    } else used.delete(held);
  };
}
