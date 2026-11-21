import { describe, expect, it, vi } from "vitest";
import { KeyController, PRIORITY, type KeyPress } from "./controller";
import { numbersMapping, targetForKey } from "./mappings";

const press = (key: string, mods: Partial<KeyPress> = {}): KeyPress => ({
  key,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...mods,
});

describe("the key controller", () => {
  it("offers a key to the scopes by priority, the latest first among equals, until one uses it", () => {
    const keys = new KeyController();
    const seen: string[] = [];
    const scope = (name: string, uses: string) => (p: KeyPress) => {
      seen.push(name);
      return p.key === uses;
    };
    keys.add(scope("field", "1"), { priority: PRIORITY.field });
    const removeEditor = keys.add(scope("editor", "e"), { priority: PRIORITY.editor });
    keys.add(scope("newer field", "2"), { priority: PRIORITY.field });
    expect(keys.dispatch(press("1"))).toBe(true);
    expect(seen).toEqual(["editor", "newer field", "field"]);
    seen.length = 0;
    removeEditor();
    expect(keys.dispatch(press("x"))).toBe(false);
    expect(seen).toEqual(["newer field", "field"]);
  });

  it("an exclusive scope (an open menu) keeps the keys it doesn't use from the scopes below", () => {
    const keys = new KeyController();
    const field = vi.fn(() => true);
    keys.add(field);
    const closeMenu = keys.add(() => false, { priority: PRIORITY.menu, exclusive: true });
    expect(keys.dispatch(press("1"))).toBe(false);
    expect(field).not.toHaveBeenCalled();
    closeMenu();
    expect(keys.dispatch(press("1"))).toBe(true);
  });
});

describe("the numbers mapping", () => {
  const targets = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `option ${i}` }));

  it("gives 1 to 9 to the first nine options", () => {
    expect(numbersMapping.assign(targets(3))).toEqual(["1", "2", "3"]);
    expect(numbersMapping.assign(targets(11)).slice(8)).toEqual(["9", null, null]);
  });

  it("finds the option of a key, a fixed key too, never a disabled one", () => {
    const group = [{ label: "a", keys: ["ArrowLeft"] }, { label: "b", disabled: true }, { label: "c" }];
    expect(targetForKey(numbersMapping, group, "3")).toBe(2);
    expect(targetForKey(numbersMapping, group, "ArrowLeft")).toBe(0);
    expect(targetForKey(numbersMapping, group, "2")).toBe(-1);
    expect(targetForKey(numbersMapping, group, "x")).toBe(-1);
  });

  it("leaves fixed keys (special options) out of the numbering", async () => {
    const { keysOf } = await import("./mappings");
    const group = [{ label: "a" }, { label: "Don't know", fixed: "." }, { label: "b" }, { label: "n/a", fixed: "0" }];
    expect(keysOf(numbersMapping, group)).toEqual(["1", ".", "2", "0"]);
    expect(targetForKey(numbersMapping, group, "0")).toBe(3);
    expect(targetForKey(numbersMapping, group, "2")).toBe(2);
  });
});

describe("moving focus with the arrow keys", () => {
  const rect = (left: number, top: number, width = 40, height = 20) =>
    ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect;

  it("goes to the nearest target ahead, preferring the same row or column", async () => {
    const { nearest } = await import("./focus");
    // A 3 x 2 grid: (0,0) (50,0) (100,0) / (0,30) (50,30) (100,30)
    const grid = [rect(50, 0), rect(100, 0), rect(0, 30), rect(50, 30), rect(100, 30)].map((r) => ({ rect: r }));
    const from = rect(0, 0);
    expect(nearest(from, grid, "right")).toBe(0);
    expect(nearest(from, grid, "down")).toBe(2);
    expect(nearest(from, grid, "left")).toBe(-1);
    expect(nearest(from, grid, "up")).toBe(-1);
  });
});

describe("the other mappings", () => {
  it("numpad: the key where the button is, 7 8 9 at the top in every question; without places numbers", async () => {
    const { keysOf, numpadMapping } = await import("./mappings");
    const grid = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ label: `${i}`, pos: { row: Math.floor(i / 3), col: i % 3 } }));
    expect(keysOf(numpadMapping, grid(3))).toEqual(["7", "8", "9"]);
    expect(keysOf(numpadMapping, grid(5))).toEqual(["7", "8", "9", "4", "5"]);
    expect(keysOf(numpadMapping, grid(11)).slice(6)).toEqual(["1", "2", "3", null, null]);
    // Swipe: left, right below up
    const swipe = [
      { label: "l", pos: { row: 1, col: 0 } },
      { label: "r", pos: { row: 1, col: 2 } },
      { label: "u", pos: { row: 0, col: 1 } },
    ];
    expect(keysOf(numpadMapping, swipe)).toEqual(["4", "6", "8"]);
    expect(keysOf(numpadMapping, [{ label: "a" }, { label: "b" }])).toEqual(["1", "2"]);
  });

  it("letters: the home row first; beyond 26 options numbers", async () => {
    const { keysOf, lettersMapping } = await import("./mappings");
    const options = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `${i}` }));
    expect(keysOf(lettersMapping, options(5))).toEqual(["a", "s", "d", "f", "j"]);
    expect(keysOf(lettersMapping, [...options(2), { label: "n/a", fixed: "0" }])).toEqual(["a", "s", "0"]);
    expect(keysOf(lettersMapping, options(27))[0]).toBe("1");
  });

  it("type to filter: a word of the label starts with what was typed", async () => {
    const { labelMatches } = await import("./mappings");
    expect(labelMatches("Human interest", "int")).toBe(true);
    expect(labelMatches("Human interest", "hu")).toBe(true);
    expect(labelMatches("Économie", "eco")).toBe(true);
    expect(labelMatches("Politics", "lit")).toBe(false);
    expect(labelMatches("Anything", "")).toBe(true);
  });
});
