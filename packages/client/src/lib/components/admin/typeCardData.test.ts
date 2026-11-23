import { describe, expect, it } from "vitest";
import { answerTypeCards } from "./typeCardData";
import { VARIABLE_TYPE_OPTIONS_UNIT, VARIABLE_TYPE_OPTIONS_USER } from "../../design/answerTypes";

describe("type cards", () => {
  it("offer marking text and relations only in unit loops, and never 'type later' or random", () => {
    const outside = answerTypeCards(VARIABLE_TYPE_OPTIONS_USER).map((c) => c.type);
    const inside = answerTypeCards(VARIABLE_TYPE_OPTIONS_UNIT).map((c) => c.type);
    expect(outside).not.toContain("span");
    expect(outside).not.toContain("relation");
    expect(inside).toEqual(expect.arrayContaining(["span", "relation", "nominal"]));
    expect([...outside, ...inside]).not.toContain("unspecified");
    expect([...outside, ...inside]).not.toContain("random");
    for (const card of answerTypeCards(VARIABLE_TYPE_OPTIONS_UNIT)) expect(card.label && card.description).toBeTruthy();
  });
});
