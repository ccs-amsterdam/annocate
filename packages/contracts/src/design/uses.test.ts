import { describe, expect, it } from "vitest";
import { inferUses, usesConflicts, designUses } from "./uses.js";
import { validateDesignItems } from "./validation.js";
import { toCoderItems } from "./coderCodebook.js";
import { redirectSettings, type TopLevelItem } from "./item.js";

const session = (extra: object = {}) => ({ type: "session", params: [], ...extra });
const question = (name: string) => ({ type: "question", name, variable: { type: "confirm", question: "?" } });
const loop = (label: string, children: unknown[] = [question(`${label}_q`)]) => ({
  type: "unit_loop",
  label,
  layout: { template: "" },
  children,
});
const computed = (name: string) => ({
  type: "computed",
  name,
  variable: { type: "random", draw: "random", options: [{ value: "a" }, { value: "b" }] },
});
const messages = (items: unknown[]) => validateDesignItems(items).map((i) => i.message);

describe("what a design is made of (uses)", () => {
  it("is worked out from the design when not declared", () => {
    expect(inferUses([session(), loop("A")])).toEqual({ content: "annotate", experiment: false });
    expect(inferUses([session(), question("age")])).toEqual({ content: "questions", experiment: false });
    expect(inferUses([session(), question("age"), loop("A")])).toEqual({ content: "both", experiment: false });
    expect(inferUses([session(), loop("A"), loop("B")])).toEqual({ content: "both", experiment: false });
    expect(inferUses([session()])).toEqual({ content: "both", experiment: false });
    expect(inferUses([session(), computed("group"), question("q")]).experiment).toBe(true);
    expect(
      inferUses([session({ conditions: [{ name: "framing", values: ["a", "b"], assign: "random" }] }), loop("A")]),
    ).toEqual({ content: "annotate", experiment: true });
    // A condition linked to a set column hands out units: annotating, not an experiment
    expect(
      inferUses([
        session({ conditions: [{ name: "sets", values: "free", assign: "random", units: "sets" }] }),
        loop("A"),
      ]),
    ).toEqual({ content: "annotate", experiment: false });
  });

  it("is the declared one when there is one", () => {
    expect(designUses([session({ uses: { content: "both", experiment: true } }), loop("A")])).toEqual({
      content: "both",
      experiment: true,
    });
  });

  it("names what in the design a choice doesn't allow", () => {
    const items = [
      session({
        coders: { column: "coder" },
        conditions: [{ name: "framing", values: "free", assign: "random", units: "frame" }],
      }),
      question("age"),
      loop("A"),
      loop("B"),
      computed("group"),
    ];
    expect(usesConflicts({ content: "annotate", experiment: true }, items).map((c) => c.message)).toEqual([
      "question 'age' is outside the unit loop",
      "unit loop 'B': annotating only has one unit loop",
      "computed item 'group' is outside the unit loop",
    ]);
    expect(usesConflicts({ content: "questions", experiment: true }, items).map((c) => c.message)).toEqual([
      "unit loop 'A': questions only have no units",
      "unit loop 'B': questions only have no units",
      "who codes which units (the coder column)",
      "condition 'framing' selects units",
    ]);
    expect(usesConflicts({ content: "both", experiment: false }, items).map((c) => [c.message, c.path])).toEqual([
      ["computed item 'group'", [4]],
    ]);
    const unlinked = [session({ conditions: [{ name: "tone", values: ["a", "b"], assign: "link" }] })];
    expect(
      usesConflicts({ content: "questions", experiment: false }, unlinked).map((c) => [c.message, c.path]),
    ).toEqual([["condition 'tone'", [0, "conditions", 0]]]);
    expect(usesConflicts({ content: "both", experiment: true }, items)).toEqual([]);
  });

  it("a design that doesn't fit what it declares has issues", () => {
    const items = [session({ uses: { content: "annotate", experiment: false } }), question("age"), loop("A")];
    expect(messages(items)).toContain(
      "Annotating units only, no experiment: not with question 'age' is outside the unit loop",
    );
  });
});

describe("the study's normal end (the Study entry's end)", () => {
  const ending = { message: "Thanks, $var.q.label", redirectSetting: "panel" };

  it("reaches coders as an end item after the last item", () => {
    const items = [session({ end: ending }), question("q"), loop("A")] as unknown as TopLevelItem[];
    expect(toCoderItems(items).at(-1)).toEqual({ type: "end", name: "_end", outcome: "complete", ...ending });
    expect(toCoderItems([session(), question("q")] as unknown as TopLevelItem[]).at(-1)).toMatchObject({ name: "q" });
  });

  it("its redirect setting is a deployment setting; its texts are checked", () => {
    expect(redirectSettings([session({ end: ending }), question("q")])).toEqual(["panel"]);
    expect(messages([session({ end: { message: "$var.nope.value" } }), question("q")])).toEqual([
      expect.stringContaining("'nope' is not a question"),
    ]);
    expect(messages([session({ end: { redirectUrl: "panel.example" } })])).toContain(
      "The redirect URL must start with https:// (or http://)",
    );
  });

  it("no item may be called _end", () => {
    expect(messages([session(), question("_end")])).toContain("'_end' is the study's own end: choose another name");
  });
});
