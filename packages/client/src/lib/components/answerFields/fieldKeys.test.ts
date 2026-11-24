import { describe, expect, it } from "vitest";
import { continuesText, spanKey, spanOfKey, type TextKey } from "./fieldKeys";

const key = (more: Partial<TextKey> = {}): TextKey => ({
  key: "Enter",
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  isComposing: false,
  keyCode: 13,
  ...more,
});

describe("a text answer's Enter", () => {
  it("continues in one line, not with Shift; in a text area only with Ctrl or ⌘", () => {
    expect(continuesText(key(), false)).toBe(true);
    expect(continuesText(key({ shiftKey: true }), false)).toBe(false);
    expect(continuesText(key(), true)).toBe(false);
    expect(continuesText(key({ ctrlKey: true }), true)).toBe(true);
    expect(continuesText(key({ metaKey: true }), true)).toBe(true);
    expect(continuesText(key({ key: "a" }), false)).toBe(false);
  });

  it("doesn't continue when it confirms an input method's composition", () => {
    expect(continuesText(key({ isComposing: true }), false)).toBe(false);
    expect(continuesText(key({ isComposing: true, ctrlKey: true }), true)).toBe(false);
    // Safari: the composition has ended, the key code still says so
    expect(continuesText(key({ keyCode: 229 }), false)).toBe(false);
  });
});

describe("the number keys of the spans on a clicked word", () => {
  it("1 to 9 open the first nine spans", () => {
    expect([0, 8, 9].map((i) => spanKey(i, true))).toEqual(["1", "9", null]);
    expect(spanOfKey("2", 3, true)).toBe(1);
    expect(spanOfKey("4", 3, true)).toBe(-1);
    expect(spanOfKey("0", 3, true)).toBe(-1);
    expect(spanOfKey("x", 3, true)).toBe(-1);
  });

  it("not when answers take no keys (the coder's setting, or the study's)", () => {
    expect(spanKey(0, false)).toBeNull();
    expect(spanOfKey("1", 3, false)).toBe(-1);
  });
});
