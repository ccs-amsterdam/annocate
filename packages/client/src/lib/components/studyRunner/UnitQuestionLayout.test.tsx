import { isValidElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { RelationType } from "@annotinder/contracts";
import { RelationAnnotationProvider } from "../../context/RelationAnnotationContext";
import type { StudyManagerSnapshot } from "../../studyManager/types";
import { UnitAnnotations } from "./UnitQuestionLayout";
import type { CurrentQuestion } from "./useCurrentQuestion";

const relation: RelationType = {
  type: "relation",
  question: "Link them",
  rules: [{ from: { variable: "spans" }, to: { variable: "spans" } }],
  options: [{ value: "supports" }],
};

function question(name: string, relationVariable: RelationType | null): CurrentQuestion {
  return { item: { name }, spanVariable: null, relationVariable } as CurrentQuestion;
}

const snapshot = {
  currentUnit: { id: 7 },
  currentUnitVariables: {},
  currentLoopVariables: null,
} as StudyManagerSnapshot;

/** The components around the unit, outermost first, each with its key: React keeps what is inside mounted while these stay the same. */
function wrappers(node: ReactNode): { type: unknown; key: string | null }[] {
  if (!isValidElement<{ children?: ReactNode }>(node) || typeof node.type === "string") return [];
  return [{ type: node.type, key: node.key }, ...wrappers(node.props.children)];
}

const annotations = (q: CurrentQuestion) => wrappers(UnitAnnotations({ question: q, snapshot, children: <div /> }));

describe("the annotation state around a unit", () => {
  it("is the same components with the same keys for every question of the unit: the unit stays mounted", () => {
    const first = annotations(question("topic", null));
    expect(first.length).toBeGreaterThan(0);
    expect(annotations(question("links", relation))).toEqual(first);
  });

  it("holds a relation question's state", () => {
    const types = annotations(question("links", relation)).map((w) => w.type);
    expect(types).toContain(RelationAnnotationProvider);
  });
});
