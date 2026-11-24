import type { RefObject } from "react";
import { numericSteps } from "@annotinder/contracts";
import { isContinue } from "../../keyboard/commands";
import { PRIORITY } from "../../keyboard/controller";
import { useKeyScope } from "../../keyboard/hooks";
import type { QuestionVariable } from "./types";

// A numeric question's values and keys (NumericAnswerField).

export type NumericVariable = Extract<QuestionVariable, { type: "numeric" }>;

/** The number of decimals a step needs (0.1 -> 1). */
function decimals(step: number): number {
  const text = String(step);
  return text.includes(".") ? text.split(".")[1].length : 0;
}

/** The values a numeric question has a button for: from its minimum, a step apart. */
export function buttonValues(variable: NumericVariable): number[] {
  const step = variable.step ?? 1;
  return Array.from({ length: numericSteps(variable) ?? 0 }, (_, i) =>
    Number(((variable.min ?? 0) + i * step).toFixed(decimals(step))),
  );
}

/** A slider's value, and what changes or answers it. */
export interface SliderState {
  variable: NumericVariable;
  /** The value chosen (null: none yet, the thumb is in the middle). */
  value: number | null;
  setValue: (n: number) => void;
  onAnswer: (n: number) => void;
}

/** Where a key moves the slider from `from`: a step left or right, or to an end. Null: not a key of the slider. */
function sliderTarget(key: string, from: number, { min, max, step }: { min: number; max: number; step: number }) {
  if (key === "ArrowLeft") return from - step;
  if (key === "ArrowRight") return from + step;
  if (key === "Home") return min;
  if (key === "End") return max;
  return null;
}

/**
 * A slider's keys, while `active`: Left / Right step the value (from the
 * middle at first), Home / End go to the ends, Ctrl + Enter continues.
 */
export function useSliderKeys({ variable, value, setValue, onAnswer }: SliderState, active: boolean): void {
  const step = variable.step ?? 1;
  useKeyScope(
    (press) => {
      if (isContinue(press)) {
        if (value === null) return false;
        onAnswer(value);
        return true;
      }
      if (press.altKey || press.ctrlKey || press.metaKey || press.shiftKey) return false;
      const min = variable.min!;
      const max = variable.max!;
      const from = value ?? min + Math.floor((max - min) / 2 / step) * step;
      const next = sliderTarget(press.key, from, { min, max, step });
      if (next === null) return false;
      setValue(Number(Math.min(max, Math.max(min, next)).toFixed(decimals(step))));
      return true;
    },
    active,
    { priority: PRIORITY.field },
  );
}

/** While `active`: typing a number starts it in the input, without first going to the input (Tab). */
export function useTypeIntoInput(
  input: RefObject<HTMLInputElement | null>,
  setText: (change: (text: string) => string) => void,
  active: boolean,
): void {
  useKeyScope(
    (press) => {
      if (press.altKey || press.ctrlKey || press.metaKey || !/^[0-9.,-]$/.test(press.key)) return false;
      setText((t) => t + (press.key === "," ? "." : press.key));
      input.current?.focus();
      return true;
    },
    active,
    { priority: PRIORITY.field },
  );
}
