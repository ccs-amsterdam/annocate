import { describe, expect, it } from "vitest";
import type {
  DesignItem,
  EndItem,
  InLoopQuestionItem,
  LayoutItem,
  SessionItem,
  TopLevelItem,
  UnitLoopItem,
} from "@annotinder/contracts";
import { findItem } from "../codebook/tree";
import { updateItem } from "./itemEdit";
import {
  redirectKind,
  studyEndOf,
  withComments,
  withHighlights,
  withInstruction,
  withLoopCondition,
  withLoopUnits,
  withOptional,
  withOptionals,
  withRedirect,
  withSessionPart,
  withSessionTitle,
  withSnippets,
  withUrlParams,
} from "./itemSettings";

// A design with every setting the forms can remove, as the editor holds it (with keys).
const session = {
  _key: "s",
  type: "session",
  public: { title: "News study" },
  urlParams: [{ name: "wave" }],
  display: { layouts: "responsive" },
} as unknown as SessionItem;
const question = {
  _key: "q",
  type: "question",
  name: "tone",
  comments: true,
  instruction: "Read it all",
  instructionOpen: "first",
  variable: { type: "confirm", question: "Negative?" },
} as unknown as InLoopQuestionItem;
const layout = {
  _key: "y",
  type: "layout",
  template: "$unit.text [[intro]]",
  snippets: { intro: "Hi" },
  highlight: [{ query: "climate" }],
} as unknown as LayoutItem;
const loop = {
  _key: "l",
  type: "unit_loop",
  id: "loop_1",
  condition: { script: "true" },
  units: { part: "a" },
  children: [layout, question],
} as unknown as UnitLoopItem;
const end = {
  _key: "e",
  type: "end",
  name: "bye",
  outcome: "screenout",
  message: "Thanks",
  redirectUrl: "https://example.org",
} as unknown as EndItem;
const items = [session, loop, end] as unknown as TopLevelItem[];

/** The item as it is in the design after the editor's update with `next` (what a form's change does). */
function updated(key: string, next: object): Record<string, unknown> {
  const design = updateItem(items, key, next as DesignItem);
  return findItem(design, key) as unknown as Record<string, unknown>;
}

describe("withOptional", () => {
  it("sets a value, or removes the key for undefined", () => {
    expect(withOptional({ a: 1 } as { a: number; b?: number }, "b", 2)).toEqual({ a: 1, b: 2 });
    const without = withOptional({ a: 1, b: 2 } as { a: number; b?: number }, "b", undefined);
    expect(Object.keys(without)).toEqual(["a"]);
  });

  it("applies a patch, removing its undefined settings", () => {
    const next = withOptionals({ a: 1, b: 2, c: 3 } as { a: number; b?: number; c?: number }, { a: 5, b: undefined });
    expect(next).toEqual({ a: 5, c: 3 });
    expect(Object.keys(next)).toEqual(["a", "c"]);
  });
});

describe("a form removing a setting removes it from the design", () => {
  it("the session title, emptied", () => {
    expect(updated("s", withSessionTitle(session, ""))).not.toHaveProperty("public");
    expect(updated("s", withSessionTitle(session, "Other")).public).toEqual({ title: "Other" });
  });

  it("the last URL parameter, removed", () => {
    expect(updated("s", withUrlParams(session, []))).not.toHaveProperty("urlParams");
  });

  it("a part of the session, set to null in its JSON", () => {
    expect(updated("s", withSessionPart(session, "display", null))).not.toHaveProperty("display");
    expect(updated("s", withSessionPart(session, "display", { theme: "dark" })).display).toEqual({ theme: "dark" });
  });

  it("'coders can add a comment', unticked", () => {
    const next = updated("q", withComments(question, false));
    expect(next).not.toHaveProperty("comments");
    expect(updated("q", withComments(next as never, true)).comments).toBe(true);
  });

  it("an instruction, with when it opens", () => {
    const next = updated("q", withInstruction(question, { instruction: undefined }));
    expect(next).not.toHaveProperty("instruction");
    expect(next).not.toHaveProperty("instructionOpen");
    expect(updated("q", withInstruction(question, { instructionOpen: undefined }))).not.toHaveProperty(
      "instructionOpen",
    );
    expect(updated("q", withInstruction(question, { instructionOpen: "practice" })).instructionOpen).toBe("practice");
  });

  it("a loop's condition, unticked; its children stay", () => {
    const next = updated("l", withLoopCondition(loop, false));
    expect(next).not.toHaveProperty("condition");
    expect(next.children).toHaveLength(2);
    expect(updated("l", withLoopCondition(next as never, true)).condition).toEqual({ script: "true" });
  });

  it("a loop's units settings, all back to the default", () => {
    expect(updated("l", withLoopUnits(loop, {}))).not.toHaveProperty("units");
  });

  it("an end item's redirect and message", () => {
    expect(redirectKind(end)).toBe("url");
    const nowhere = updated("e", withRedirect(end, ""));
    expect(nowhere).not.toHaveProperty("redirectUrl");
    expect(nowhere).not.toHaveProperty("redirectSetting");
    const setting = updated("e", withRedirect(end, "setting"));
    expect(setting).not.toHaveProperty("redirectUrl");
    expect(setting.redirectSetting).toBe("panel_screenout");
    expect(redirectKind(setting as never)).toBe("setting");
    expect(updated("e", withOptional(end, "message", undefined))).not.toHaveProperty("message");
  });

  it("a layout's last snippet and last highlight", () => {
    expect(updated("y", withSnippets(layout, []))).not.toHaveProperty("snippets");
    expect(updated("y", withSnippets(layout, [["a", "A"]])).snippets).toEqual({ a: "A" });
    expect(updated("y", withHighlights(layout, []))).not.toHaveProperty("highlight");
  });
});

describe("studyEndOf", () => {
  const fields = (rest: object) => ({ type: "end", name: "_end", outcome: "complete", ...rest }) as EndItem;
  it("is what the end's fields set, or nothing", () => {
    expect(studyEndOf(fields({ message: "Bye", redirectUrl: "" }))).toEqual({ message: "Bye", redirectUrl: "" });
    expect(studyEndOf(fields({ message: "" }))).toBeUndefined();
    expect(studyEndOf(fields({ redirectSetting: "panel_return" }))).toEqual({ redirectSetting: "panel_return" });
  });
});
