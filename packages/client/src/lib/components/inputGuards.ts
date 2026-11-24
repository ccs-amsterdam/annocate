import type { MouseEvent } from "react";

// Guards against input that answers more than the coder meant to.
//
// A double click (or a quick double tap) on an answer: the first click
// answers, the next question appears under the pointer, and the second click
// would answer it too. The second click of a double click (`detail` 2 or
// more) is dropped in the answer area; separate clicks always count.
//
// A key held down repeats: the keyboard drops the repeats of a key it used
// (keyboard/keyDown.ts).

/** `onClickCapture` for the answer area: the second click of a double click never reaches the answer's buttons. */
export function dropRepeatedClick(event: MouseEvent): void {
  if (event.detail > 1) event.stopPropagation();
}
