import { describe, expect, it } from "vitest";
import { canStartRelation, relationTypesFor, ruleVariables } from "./relations.js";
import { validateDesignItems } from "./validation.js";
import { validateVariables } from "./answers.js";
import type { AnyVariableType, RelationRule } from "./variableTypes.js";

const options = [{ value: "attacks" }, { value: "supports" }, { value: "employs" }];
// Actors attack or support actors; organisations employ persons
const rules: RelationRule[] = [
  { from: { variable: "actors" }, to: { variable: "actors" }, options: ["attacks", "supports"] },
  {
    from: { variable: "actors", values: ["organisation"] },
    to: { variable: "actors", values: ["person"] },
    options: ["employs"],
  },
];
const span = (id: string, value: string, variable = "actors") => ({ id, variable, value });

describe("relation rules", () => {
  it("say which spans can start a relation", () => {
    expect(canStartRelation(rules, span("a", "person"))).toBe(true);
    expect(canStartRelation(rules, span("t", "topic", "topics"))).toBe(false);
  });

  it("give the relation types between two spans, in option order; none from a span to itself", () => {
    expect(relationTypesFor(rules, options, span("o", "organisation"), span("p", "person"))).toEqual([
      "attacks",
      "supports",
      "employs",
    ]);
    expect(relationTypesFor(rules, options, span("p", "person"), span("o", "organisation"))).toEqual([
      "attacks",
      "supports",
    ]);
    expect(relationTypesFor(rules, options, span("p", "person"), span("p", "person"))).toEqual([]);
    // Without options: every type
    expect(
      relationTypesFor(
        [{ from: { variable: "actors" }, to: { variable: "actors" } }],
        options,
        span("a", "x"),
        span("b", "y"),
      ),
    ).toHaveLength(3);
  });

  it("name the span questions they use", () => {
    expect(ruleVariables(rules)).toEqual(["actors"]);
  });
});

describe("relation question validation", () => {
  const spans = {
    type: "question",
    name: "actors",
    variable: {
      type: "span",
      question: "?",
      fields: ["text"],
      options: [{ value: "person" }, { value: "organisation" }],
    },
  };
  const relation = (rules: unknown[]) => ({
    type: "question",
    name: "relations",
    variable: { type: "relation", question: "?", options: [{ value: "attacks" }], rules },
  });
  const loop = (children: unknown[]) => [{ type: "unit_loop", layout: { template: "$unit.text" }, children }];
  const messages = (items: unknown[]) => validateDesignItems(items).map((i) => i.message);

  it("accepts rules over an earlier span question of the loop", () => {
    expect(
      messages(
        loop([spans, relation([{ from: { variable: "actors" }, to: { variable: "actors", values: ["person"] } }])]),
      ),
    ).toEqual([]);
  });

  it("refuses unknown span questions, labels and types, and a question without rules", () => {
    const found = messages(
      loop([
        spans,
        relation([{ from: { variable: "nope" }, to: { variable: "actors", values: ["robot"] }, options: ["hugs"] }]),
      ]),
    );
    expect(found).toEqual(
      expect.arrayContaining([
        expect.stringContaining("'nope', which is not a span question"),
        "'actors' has no label 'robot'",
        "This relation question has no type 'hugs'",
      ]),
    );
    expect(messages(loop([spans, relation([])])).join()).toMatch(/Add a rule/);
    // A span question after the relation question doesn't count
    expect(
      messages(loop([relation([{ from: { variable: "actors" }, to: { variable: "actors" } }]), spans])).join(),
    ).toMatch(/not a span question before it/);
  });
});

describe("relation answers on submit", () => {
  const variables = new Map<string, AnyVariableType>([
    [
      "actors",
      { type: "span", question: "?", fields: ["text"], options: [{ value: "person" }, { value: "organisation" }] },
    ],
    ["relations", { type: "relation", question: "?", options, rules }],
  ]);
  const slice = [{ offset: 0, length: 1, text: "A" }];
  const answers = (relations: { fromId: string; toId: string; value: string }[]) => ({
    actors: {
      done: true,
      skip: false,
      spans: [
        { id: "p", field: "text", value: "person", slices: slice },
        { id: "o", field: "text", value: "organisation", slices: slice },
      ],
    },
    relations: { done: true, skip: false, relations: relations.map((r, i) => ({ id: `r${i}`, ...r })) },
  });

  it("takes relations the rules allow between spans of the answers", () => {
    expect(validateVariables(variables, answers([{ fromId: "o", toId: "p", value: "employs" }]))).toEqual([]);
  });

  it("refuses other types for the pair, and spans that aren't there", () => {
    expect(validateVariables(variables, answers([{ fromId: "p", toId: "o", value: "employs" }]))).toEqual([
      "'relations': a 'employs' relation isn't allowed from 'person' to 'organisation'",
    ]);
    expect(validateVariables(variables, answers([{ fromId: "p", toId: "gone", value: "attacks" }]))).toEqual([
      "'relations': a relation refers to a span that isn't there",
    ]);
  });
});
