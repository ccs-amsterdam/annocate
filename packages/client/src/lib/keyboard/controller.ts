// Keyboard input on the coding screen (docs/client.md §4 "Keyboard"): one
// listener, and scopes that handle keys in turn. A scope is a field's
// choices, a menu, a span editor. Higher priority goes first (menus over the
// question behind them); among equals, the latest registered. A scope that
// handles a key ends it; an exclusive scope also keeps the keys it doesn't
// handle from the scopes below it (an open menu).

/** What a scope sees of a key press: the key and its modifiers. */
export interface KeyPress {
  key: string;
  /** The physical key (`Digit1`), where known: the same whatever the keyboard layout. */
  code?: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  /** Space or Enter on a focused control (a button): the browser clicks it unless a scope uses the key. */
  onControl?: boolean;
}

/** A scope's answer to a key press: true when it used the key. */
export type KeyHandler = (press: KeyPress) => boolean;

export interface ScopeOptions {
  /** Menus and dialogs: higher than answer fields (0). */
  priority?: number;
  /** Keys this scope doesn't handle don't reach the scopes below it. */
  exclusive?: boolean;
}

interface Scope extends Required<ScopeOptions> {
  id: number;
  handler: KeyHandler;
}

/** Priorities of the kinds of scopes. */
export const PRIORITY = { base: -10, field: 0, editor: 5, menu: 10 } as const;

export class KeyController {
  private scopes: Scope[] = [];
  private next = 0;
  private focusRequested = false;

  /** Adds a scope; returns its removal. */
  add(handler: KeyHandler, options: ScopeOptions = {}): () => void {
    const scope: Scope = { id: this.next++, handler, priority: options.priority ?? 0, exclusive: !!options.exclusive };
    this.scopes.push(scope);
    return () => {
      this.scopes = this.scopes.filter((s) => s !== scope);
    };
  }

  /** The next question's field focuses its chosen target when it appears (after going back with the keyboard). */
  requestFocus(): void {
    this.focusRequested = true;
  }

  /** Whether a field should focus its chosen target now (once). */
  takeFocusRequest(): boolean {
    const requested = this.focusRequested;
    this.focusRequested = false;
    return requested;
  }

  /** Offers a key press to the scopes in turn; true when one used it. */
  dispatch(press: KeyPress): boolean {
    const ordered = [...this.scopes].sort((a, b) => b.priority - a.priority || b.id - a.id);
    for (const scope of ordered) {
      if (scope.handler(press)) return true;
      if (scope.exclusive) return false;
    }
    return false;
  }
}

/** Whether a key press comes from typing in a field (those keys are the field's). A slider isn't one: its keys are scopes' too. */
export function inTextField(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLInputElement && target.type === "range") return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
