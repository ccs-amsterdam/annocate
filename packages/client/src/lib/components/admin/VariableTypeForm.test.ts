import { describe, expect, it } from "vitest";
import type { AnyVariableType } from "@annotinder/contracts";
import { switchVariableType } from "./VariableTypeForm";

describe("switchVariableType", () => {
  const nominal: AnyVariableType = {
    type: "nominal",
    question: "Tone?",
    multiple: true,
    layout: "flex",
    options: [{ value: "neg", label: "Negative" }, { value: "pos" }],
  };

  it("converts nominal and ordinal into each other, keeping the options", () => {
    const ordinal = switchVariableType(nominal, "ordinal");
    expect(ordinal).toEqual({
      type: "ordinal",
      question: "Tone?",
      options: [
        { value: 1, label: "Negative" },
        { value: 2, label: "pos" },
      ],
    });
    expect(switchVariableType(ordinal, "nominal")).toMatchObject({
      type: "nominal",
      options: [
        { value: "negative", label: "Negative" },
        { value: "pos", label: "pos" },
      ],
    });
  });

  it("starts other types from their defaults, keeping the question text", () => {
    expect(switchVariableType(nominal, "numeric")).toEqual({ type: "numeric", question: "Tone?", min: 0, max: 10 });
  });
});
