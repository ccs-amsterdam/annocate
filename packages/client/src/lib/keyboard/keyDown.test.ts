import { afterEach, describe, expect, it, vi } from "vitest";
import { KeyController, PRIORITY, type KeyPress } from "./controller";
import { keyDownHandler, type KeyDown } from "./keyDown";
import { leaderActive, setLeader } from "./leader";
import { moveFocus } from "./focus";

/** A key press as the window listener gets it; `prevented` tells whether the browser still acts on it. */
function keyDown(key: string, more: Partial<KeyDown> = {}) {
  const event = {
    key,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    repeat: false,
    isComposing: false,
    defaultPrevented: false,
    target: null,
    prevented: false,
    preventDefault() {
      event.prevented = true;
    },
    ...more,
  };
  return event;
}

/** A keyboard whose only scope uses the keys in `uses`. */
function keyboard(...uses: string[]) {
  const controller = new KeyController();
  const seen: KeyPress[] = [];
  controller.add((press) => {
    seen.push(press);
    return uses.includes(press.key);
  });
  return { controller, seen, press: keyDownHandler(controller) };
}

afterEach(() => {
  setLeader(false);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("key presses on the coding screen", () => {
  it("leaves a key no scope uses, and its repeats, to the browser (holding ↓ or Space scrolls)", () => {
    const { press, seen } = keyboard("1");
    for (const key of ["ArrowDown", " ", "PageDown"]) {
      const first = keyDown(key);
      const repeat = keyDown(key, { repeat: true });
      press(first);
      press(repeat);
      expect([key, first.prevented, repeat.prevented]).toEqual([key, false, false]);
    }
    expect(seen.map((p) => p.key)).toEqual(["ArrowDown", " ", "PageDown"]);
  });

  it("a held-down key chooses once: the repeats of a used key are dropped", () => {
    const { press, seen } = keyboard("1");
    const first = keyDown("1", { code: "Digit1" });
    const repeat = keyDown("1", { code: "Digit1", repeat: true });
    press(first);
    press(repeat);
    expect([first.prevented, repeat.prevented]).toEqual([true, true]);
    expect(seen).toHaveLength(1);
  });

  it("decides on a key's repeats by its latest first press", () => {
    const controller = new KeyController();
    const press = keyDownHandler(controller);
    const remove = controller.add(() => true);
    press(keyDown("ArrowDown"));
    remove();
    press(keyDown("ArrowDown"));
    const repeat = keyDown("ArrowDown", { repeat: true });
    press(repeat);
    expect(repeat.prevented).toBe(false);
  });

  it("an open menu keeps answer keys, the arrows and Ctrl + Enter from the question behind it", () => {
    const { controller, press, seen } = keyboard("1", "ArrowLeft", "Enter");
    const close = controller.add(() => false, { priority: PRIORITY.menu, exclusive: true });
    const events = [keyDown("1"), keyDown("ArrowLeft"), keyDown("Enter", { ctrlKey: true })];
    events.forEach(press);
    // After the leader too: / Enter is Ctrl + Enter
    press(keyDown("/", { code: "Slash" }));
    press(keyDown("Enter"));
    expect(seen).toEqual([]);
    // The menu's own controls get them (Tab, Esc, typing)
    expect(events.map((e) => e.prevented)).toEqual([false, false, false]);
    close();
    press(keyDown("1"));
    expect(seen.map((p) => p.key)).toEqual(["1"]);
  });

  it("the leader, then a command as its Ctrl press; holding / doesn't cancel it", () => {
    const { press, seen } = keyboard("Enter");
    const leader = keyDown("/", { code: "Slash" });
    const held = keyDown("/", { code: "Slash", repeat: true });
    press(leader);
    press(held);
    expect([leader.prevented, held.prevented, leaderActive()]).toEqual([true, true, true]);
    press(keyDown("Shift"));
    expect(leaderActive()).toBe(true);
    press(keyDown("Enter"));
    expect(leaderActive()).toBe(false);
    expect(seen).toMatchObject([{ key: "Enter", ctrlKey: true }]);
  });

  it("the leader is the typed / too: Shift + 7 on a German keyboard, then 8", () => {
    const { press, seen } = keyboard("8");
    press(keyDown("Shift", { code: "ShiftLeft", shiftKey: true }));
    const leader = keyDown("/", { code: "Digit7", shiftKey: true });
    press(leader);
    expect([leader.prevented, leaderActive()]).toEqual([true, true]);
    press(keyDown("8", { code: "Digit8" }));
    expect(leaderActive()).toBe(false);
    expect(seen.at(-1)).toMatchObject({ key: "8", code: "Digit8", ctrlKey: true });
  });

  it("the leader is the physical / key too, whatever it types (- on a German keyboard), and the numpad's", () => {
    for (const [key, code] of [
      ["-", "Slash"],
      ["/", "NumpadDivide"],
    ]) {
      const { press } = keyboard();
      press(keyDown(key, { code }));
      expect([code, leaderActive()]).toEqual([code, true]);
      setLeader(false);
    }
  });

  it("the leader with Ctrl, Alt or ⌘ is not the leader", () => {
    const { press } = keyboard();
    for (const modifier of ["ctrlKey", "altKey", "metaKey"]) press(keyDown("/", { code: "Slash", [modifier]: true }));
    expect(leaderActive()).toBe(false);
  });

  it("the leader is dropped after 3 seconds: / then 8 after 4 seconds types 8", () => {
    vi.useFakeTimers();
    const { press, seen } = keyboard("8");
    press(keyDown("/", { code: "Slash" }));
    vi.advanceTimersByTime(2900);
    expect(leaderActive()).toBe(true);
    vi.advanceTimersByTime(1100);
    expect(leaderActive()).toBe(false);
    press(keyDown("8", { code: "Digit8" }));
    expect(seen).toMatchObject([{ key: "8", ctrlKey: false }]);
  });

  it("a command in time ends the wait: a later leader gets its own 3 seconds", () => {
    vi.useFakeTimers();
    const { press, seen } = keyboard("8");
    press(keyDown("/", { code: "Slash" }));
    vi.advanceTimersByTime(2000);
    press(keyDown("8", { code: "Digit8" }));
    press(keyDown("/", { code: "Slash" }));
    vi.advanceTimersByTime(2000);
    expect(leaderActive()).toBe(true);
    press(keyDown("8", { code: "Digit8" }));
    expect(seen).toMatchObject([{ ctrlKey: true }, { ctrlKey: true }]);
  });

  it("ignores a key while an input method composes, and one already handled", () => {
    const { press, seen } = keyboard("1");
    press(keyDown("1", { isComposing: true }));
    press(keyDown("1", { defaultPrevented: true }));
    expect(seen).toEqual([]);
  });
});

describe("↑ and ↓ with focus outside the answers", () => {
  /** A page with one answer target (not focused) and a unit scrolled to `top` of 1000 px, 400 showing. */
  function page(top: number) {
    const target = { disabled: false, getClientRects: () => [1], getAttribute: () => null, focus: vi.fn() };
    const unit = { scrollTop: top, clientHeight: 400, scrollHeight: 1000 };
    vi.stubGlobal("document", {
      activeElement: null,
      querySelectorAll: (selector: string) => (selector === "[data-key-scroll]" ? [unit] : [target]),
    });
    return target;
  }

  it("are the browser's while the unit can scroll that way", () => {
    const target = page(300);
    expect(moveFocus("down")).toBe(false);
    expect(moveFocus("up")).toBe(false);
    expect(target.focus).not.toHaveBeenCalled();
  });

  it("move to the answers at the unit's end; ← and → always do", () => {
    const top = page(0);
    expect(moveFocus("up")).toBe(true);
    expect(moveFocus("right")).toBe(true);
    expect(top.focus).toHaveBeenCalledTimes(2);
    const bottom = page(600);
    expect(moveFocus("down")).toBe(true);
    expect(bottom.focus).toHaveBeenCalledTimes(1);
  });
});
