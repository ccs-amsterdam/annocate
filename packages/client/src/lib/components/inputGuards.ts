import { useEffect, type MouseEvent } from "react";

// Guards against input that answers more than the coder meant to.
//
// A double click (or a quick double tap) on an answer: the first click
// answers, the next question appears under the pointer, and the second click
// would answer it too. The second click of a double click (`detail` 2 or
// more) is dropped in the answer area; separate clicks always count.
//
// A key held down repeats (`repeat`): number and arrow keys would answer
// question after question. Repeats are dropped, except in text fields.

/** `onClickCapture` for the answer area: the second click of a double click never reaches the answer's buttons. */
export function dropRepeatedClick(event: MouseEvent): void {
  if (event.detail > 1) event.stopPropagation();
}

const ANSWER_KEYS = /^([0-9]|Arrow(Left|Right|Up|Down)|Enter| )$/;

function inTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** While mounted, a held-down answer key answers once (window listeners, as the answer fields use, never see its repeats). */
export function useNoKeyRepeat(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat && ANSWER_KEYS.test(event.key) && !inTextField(event.target)) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);
}
