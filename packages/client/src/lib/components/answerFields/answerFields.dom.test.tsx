// @vitest-environment happy-dom
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { VariableValue } from "@annotinder/contracts";
import { KeyboardProvider } from "../../keyboard/KeyboardProvider";
import { NumericAnswerField } from "./NumericAnswerField";
import { ScaleAnswerField } from "./ScaleAnswerField";
import { TextAnswerField } from "./TextAnswerField";
import type { NumericVariable } from "./numericKeys";
import type { ScaleVariable } from "./scaleRows";

afterEach(cleanup);

/** A field on the coding screen (its keys work), and the answers it gave. */
function shown(field: (onAnswer: (value: VariableValue) => void) => ReactElement) {
  const onAnswer = vi.fn<(value: VariableValue) => void>();
  render(<KeyboardProvider>{field(onAnswer)}</KeyboardProvider>);
  /** The values of the latest answer. */
  const answered = () => onAnswer.mock.lastCall?.[0].values;
  return { onAnswer, answered };
}

const press = (key: string, more: KeyboardEventInit = {}, on: Element | Window = window) =>
  fireEvent.keyDown(on, { key, ...more });

const numeric = (more: Partial<NumericVariable>): NumericVariable => ({
  type: "numeric",
  question: "How many?",
  ...more,
});

describe("NumericAnswerField", () => {
  it("a small range: a button per value, chosen by a click or its number key", () => {
    const { answered } = shown((onAnswer) => (
      <NumericAnswerField variable={numeric({ min: 1, max: 5 })} onAnswer={onAnswer} />
    ));
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["1", "2", "3", "4", "5"]);
    fireEvent.click(screen.getByText("4"));
    expect(answered()).toEqual([{ value: 4 }]);
    press("2");
    expect(answered()).toEqual([{ value: 2 }]);
  });

  it("a step of 0.1: the buttons' values are rounded to the step", () => {
    const { answered } = shown((onAnswer) => (
      <NumericAnswerField variable={numeric({ min: 0, max: 0.5, step: 0.1 })} onAnswer={onAnswer} />
    ));
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["0", "0.1", "0.2", "0.3", "0.4", "0.5"]);
    fireEvent.click(screen.getByText("0.3"));
    expect(answered()).toEqual([{ value: 0.3 }]);
  });

  it("the earlier answer is the pressed button", () => {
    shown((onAnswer) => (
      <NumericAnswerField
        variable={numeric({ min: 1, max: 3 })}
        onAnswer={onAnswer}
        initialValue={{ done: true, skip: false, values: [{ value: 2 }] }}
      />
    ));
    expect(screen.getByText("2").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("1").getAttribute("aria-pressed")).toBe("false");
  });

  it("a slider: no answer until a value is chosen; the arrows step from the middle, Home and End go to the ends", () => {
    const { onAnswer, answered } = shown((onAnswer) => (
      <NumericAnswerField variable={numeric({ min: 0, max: 10 })} onAnswer={onAnswer} />
    ));
    const slider = screen.getByLabelText<HTMLInputElement>("Value");
    const next = screen.getByText("Continue").closest("button")!;
    expect(next.disabled).toBe(true);
    // Ctrl + Enter without a value is not the slider's
    expect(press("Enter", { ctrlKey: true })).toBe(true);
    press("ArrowRight");
    expect(slider.value).toBe("6");
    press("ArrowLeft");
    press("ArrowLeft");
    expect(slider.value).toBe("4");
    press("Home");
    press("ArrowLeft");
    expect(slider.value).toBe("0");
    press("End");
    press("ArrowRight");
    expect(slider.value).toBe("10");
    expect(onAnswer).not.toHaveBeenCalled();
    press("Enter", { ctrlKey: true });
    expect(answered()).toEqual([{ value: 10 }]);
  });

  it("a slider with a step of 0.1: the keys keep the value on the step", () => {
    const { answered } = shown((onAnswer) => (
      <NumericAnswerField variable={numeric({ min: 0, max: 1, step: 0.1, layout: "slider" })} onAnswer={onAnswer} />
    ));
    // From the middle (0.5): 0.6, 0.7, not 0.7000000000000001
    press("ArrowRight");
    press("ArrowRight");
    fireEvent.click(screen.getByText("Continue"));
    expect(answered()).toEqual([{ value: 0.7 }]);
  });

  it("a slider's own keys with Shift, Ctrl or Alt are not the slider's", () => {
    shown((onAnswer) => <NumericAnswerField variable={numeric({ min: 0, max: 10 })} onAnswer={onAnswer} />);
    expect(press("ArrowRight", { shiftKey: true })).toBe(true);
    expect(press("ArrowRight", { altKey: true })).toBe(true);
    expect(screen.getByText("–")).toBeTruthy();
  });

  it("an open range: typing a number anywhere on the page starts it in the box; a comma is a decimal point", () => {
    const { answered } = shown((onAnswer) => (
      <NumericAnswerField variable={numeric({ min: 0, step: 0.5 })} onAnswer={onAnswer} />
    ));
    const box = screen.getByRole<HTMLInputElement>("spinbutton");
    press("4");
    press(",");
    press("5");
    expect(box.value).toBe("4.5");
    expect(document.activeElement).toBe(box);
    fireEvent.click(screen.getByText("Continue"));
    expect(answered()).toEqual([{ value: 4.5 }]);
  });

  it("a typed number that doesn't fit says why, and can't be given", () => {
    const { onAnswer } = shown((onAnswer) => (
      <NumericAnswerField variable={numeric({ min: 0, max: 100, layout: "input" })} onAnswer={onAnswer} />
    ));
    const box = screen.getByRole<HTMLInputElement>("spinbutton");
    const next = screen.getByText("Continue").closest("button")!;
    expect(next.disabled).toBe(true);
    fireEvent.change(box, { target: { value: "150" } });
    expect(screen.getByText("This is above the maximum 100")).toBeTruthy();
    expect(box.getAttribute("aria-invalid")).toBe("true");
    fireEvent.submit(box.closest("form")!);
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: "2.5" } });
    expect(screen.getByText("This is not a multiple of 1")).toBeTruthy();
    fireEvent.change(box, { target: { value: "25" } });
    fireEvent.submit(box.closest("form")!);
    expect(onAnswer).toHaveBeenCalledWith({ done: true, skip: false, values: [{ value: 25 }] });
  });

  it("a special answer instead of a number: by its button, or / 8", () => {
    const variable = numeric({ min: 1, max: 5, specials: [{ kind: "dont_know", value: 99 }] });
    const { answered } = shown((onAnswer) => <NumericAnswerField variable={variable} onAnswer={onAnswer} />);
    press("/");
    press("8");
    expect(answered()).toEqual([{ special: "dont_know", value: 99 }]);
    fireEvent.click(screen.getByText("3"));
    expect(answered()).toEqual([{ value: 3 }]);
  });
});

const text = (multiline: boolean) => ({ type: "text" as const, question: "Why?", multiline, maxLength: 20 });

describe("TextAnswerField", () => {
  it("one line: Enter continues with the trimmed text, Shift + Enter doesn't; nothing typed can't be given", () => {
    const { onAnswer, answered } = shown((onAnswer) => <TextAnswerField variable={text(false)} onAnswer={onAnswer} />);
    const box = screen.getByLabelText<HTMLInputElement>("Your answer");
    expect(screen.getByText("Continue").closest("button")!.disabled).toBe(true);
    press("Enter", {}, box);
    fireEvent.change(box, { target: { value: "   " } });
    press("Enter", {}, box);
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: "  because  " } });
    press("Enter", { shiftKey: true }, box);
    expect(onAnswer).not.toHaveBeenCalled();
    expect(press("Enter", {}, box)).toBe(false);
    expect(answered()).toEqual([{ value: "because" }]);
  });

  it("a text area: Enter is a new line, Ctrl or ⌘ + Enter continues", () => {
    const { onAnswer } = shown((onAnswer) => <TextAnswerField variable={text(true)} onAnswer={onAnswer} />);
    const box = screen.getByLabelText<HTMLTextAreaElement>("Your answer");
    expect(box.tagName).toBe("TEXTAREA");
    fireEvent.change(box, { target: { value: "first line" } });
    expect(press("Enter", {}, box)).toBe(true);
    expect(onAnswer).not.toHaveBeenCalled();
    press("Enter", { ctrlKey: true }, box);
    press("Enter", { metaKey: true }, box);
    expect(onAnswer).toHaveBeenCalledTimes(2);
  });

  it("the Enter that confirms an input method's composition doesn't continue", () => {
    const { onAnswer } = shown((onAnswer) => <TextAnswerField variable={text(false)} onAnswer={onAnswer} />);
    const box = screen.getByLabelText("Your answer");
    fireEvent.change(box, { target: { value: "にほん" } });
    press("Enter", { isComposing: true }, box);
    // (Safari ends the composition before its Enter: key code 229)
    press("Enter", { keyCode: 229 }, box);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("starts from the earlier answer, and counts down the characters left near the limit", () => {
    shown((onAnswer) => (
      <TextAnswerField
        variable={text(false)}
        onAnswer={onAnswer}
        initialValue={{ done: true, skip: false, values: [{ value: "seventeen letters" }] }}
      />
    ));
    expect(screen.getByLabelText<HTMLInputElement>("Your answer").value).toBe("seventeen letters");
    expect(screen.getByText(/3 characters left/)).toBeTruthy();
  });

  it("the keys typed in the box never choose or command anything on the coding screen", () => {
    shown((onAnswer) => <TextAnswerField variable={text(false)} onAnswer={onAnswer} />);
    const box = screen.getByLabelText("Your answer");
    expect(press("1", {}, box)).toBe(true);
    expect(press("/", {}, box)).toBe(true);
  });
});

const scale = (more: Partial<ScaleVariable> = {}): ScaleVariable => ({
  type: "scale",
  question: "How much do you trust…",
  items: [
    { name: "press", label: "The press" },
    { name: "courts", label: "The courts" },
  ],
  options: [
    { value: 1, label: "Not at all" },
    { value: 2, label: "Somewhat" },
    { value: 3, label: "Fully" },
  ],
  ...more,
});

describe("ScaleAnswerField", () => {
  it("Continue with an item missing gives no answer, and says how many are answered", () => {
    Element.prototype.scrollIntoView = vi.fn();
    const { onAnswer, answered } = shown((onAnswer) => <ScaleAnswerField variable={scale()} onAnswer={onAnswer} />);
    fireEvent.click(screen.getByLabelText("0 of 2 answered"));
    expect(onAnswer).not.toHaveBeenCalled();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
    const rows = screen.getAllByRole("radiogroup");
    fireEvent.click(rows[0].querySelector('[aria-label="Fully"]')!);
    expect(screen.getByLabelText("1 of 2 answered")).toBeTruthy();
    fireEvent.click(rows[1].querySelector('[aria-label="Not at all"]')!);
    fireEvent.click(screen.getByLabelText("Continue"));
    expect(answered()).toEqual([
      { item: "press", value: 3 },
      { item: "courts", value: 1 },
    ]);
  });

  it("the number keys answer the first item without an answer; Ctrl + Enter continues", () => {
    const { onAnswer, answered } = shown((onAnswer) => <ScaleAnswerField variable={scale()} onAnswer={onAnswer} />);
    press("2");
    press("Enter", { ctrlKey: true });
    expect(onAnswer).not.toHaveBeenCalled();
    press("3");
    // Every item has an answer: the keys choose nothing more
    expect(press("1")).toBe(true);
    press("Enter", { ctrlKey: true });
    expect(answered()).toEqual([
      { item: "press", value: 2 },
      { item: "courts", value: 3 },
    ]);
  });

  it("a special answer for an item: / 8 answers the first item without an answer, in a grid too", () => {
    for (const layout of ["compact", "grid"] as const) {
      const variable = scale({ layout, specials: [{ kind: "dont_know" }] });
      const { answered } = shown((onAnswer) => <ScaleAnswerField variable={variable} onAnswer={onAnswer} />);
      press("1");
      press("/");
      press("8");
      press("Enter", { ctrlKey: true });
      expect(answered()).toEqual([
        { item: "press", value: 1 },
        { item: "courts", special: "dont_know" },
      ]);
      cleanup();
    }
  });

  it("a grid: a radio button per point, and the earlier answers are checked", () => {
    const initialValue = { done: true, skip: false, values: [{ item: "press", value: 2 }] };
    const { answered } = shown((onAnswer) => (
      <ScaleAnswerField variable={scale({ layout: "grid" })} onAnswer={onAnswer} initialValue={initialValue} />
    ));
    const radios = screen.getAllByRole<HTMLInputElement>("radio");
    expect(radios).toHaveLength(6);
    expect(radios.map((r) => r.checked)).toEqual([false, true, false, false, false, false]);
    fireEvent.click(radios[5]);
    fireEvent.click(screen.getByLabelText("Continue"));
    expect(answered()).toEqual([
      { item: "press", value: 2 },
      { item: "courts", value: 3 },
    ]);
  });
});
