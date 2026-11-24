import { describe, expect, it } from "vitest";
import type { TopLevelItem } from "@annotinder/contracts";
import { designFromJson, designToJson } from "./designJson";
import { ensureKeys, stripKeys } from "./itemEdit";
import { carryKeys } from "./itemShape";
import { changedKeys } from "./editHistory";
import { flattenTree, keyOf } from "../codebook/tree";

// The whole-design JSON view: the draft's items (without editor keys) as
// text, and edited text back as items that keep their keys (useDesignDraft
// `replaceAll`).

const design = {
  public: { title: "News" },
  session: { urlParams: [{ name: "wave" }] },
  items: [
    { type: "question", name: "consent", variable: { type: "confirm", question: "Do you agree?" } },
    {
      type: "unit_loop",
      id: "loop_1",
      children: [
        { type: "layout", template: "$unit.text" },
        {
          type: "branch",
          condition: { script: "$unit.long" },
          children: [{ type: "question", name: "tone", variable: { type: "confirm", question: "Negative?" } }],
          elseChildren: [{ type: "layout", template: "# $unit.headline" }],
        },
      ],
    },
  ],
};

/** The draft's items for a design's JSON, as the editor holds them. */
function draftOf(text: string): TopLevelItem[] {
  const result = designFromJson(text);
  if ("error" in result) throw new Error(result.error);
  return ensureKeys(result.items);
}

/** The draft after its JSON view's text is edited to `text`. */
function edited(draft: TopLevelItem[], text: string): TopLevelItem[] {
  const result = designFromJson(text);
  if ("error" in result) throw new Error(result.error);
  return ensureKeys(carryKeys(result.items, draft));
}

describe("the design as JSON", () => {
  it("shows the session and public info apart from the items, and reads them back", () => {
    const draft = draftOf(JSON.stringify(design));
    expect(JSON.parse(designToJson(stripKeys(draft)))).toEqual(design);
  });

  it("applies an edit of a design with layout items: a layout's style", () => {
    const draft = draftOf(JSON.stringify(design));
    const text = designToJson(stripKeys(draft)).replace(
      '"template": "$unit.text"',
      '"template": "$unit.text", "style": { "fontSize": "1.2em" }',
    );
    const next = edited(draft, text);
    const layout = flattenTree(next).find((i) => i.type === "layout")!;
    expect(layout).toMatchObject({ style: { fontSize: "1.2em" } });
    // Every item is still the same item: only the layout changed
    expect(flattenTree(next).map(keyOf)).toEqual(flattenTree(draft).map(keyOf));
    expect([...changedKeys(next, draft)]).toEqual([keyOf(layout)]);
  });

  it("says why text can't be applied", () => {
    const error = (text: string) => {
      const result = designFromJson(text);
      return "error" in result ? result.error : null;
    };
    expect(error("{")).toBeTruthy();
    expect(error("[]")).toMatch(/is an object/);
    expect(error('{ "items": [{ "type": "layout" }] }')).toBeNull();
  });
});
