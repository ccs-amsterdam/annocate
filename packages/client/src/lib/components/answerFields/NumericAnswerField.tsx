import { useCallback, useRef, useState } from "react";
import type { SpecialAnswer, SpecialKind } from "@annotinder/contracts";
import { useAnswerLayout } from "../../display/hooks";
import { useKeyTargets } from "../../keyboard/hooks";
import { buildValues, initialSpecial, initialValues, specialValue } from "./answerValue";
import { NumberButtons } from "./NumberButtons";
import { NumberInput } from "./NumberInput";
import { NumberSlider } from "./NumberSlider";
import { buttonValues, useSliderKeys, useTypeIntoInput, type NumericVariable } from "./numericKeys";
import { SpecialAnswersRow } from "./OptionButtons";
import type { AnswerFieldProps } from "./types";

/**
 * One number: `buttons` (one per value, for small ranges), `slider` (a
 * closed range) or `input` (also open ranges). Labels at break points are
 * shown under the buttons or slider, and as hints next to an input.
 */
export function NumericAnswerField({ variable, onAnswer, initialValue }: AnswerFieldProps<NumericVariable>) {
  const { layout } = useAnswerLayout(variable);
  const initial = initialValues(initialValue)[0];
  const [value, setValue] = useState<number | null>(typeof initial === "number" ? initial : null);
  const [text, setText] = useState(typeof initial === "number" ? String(initial) : "");

  // A special answer (don't know, not applicable) instead of a number
  const [special, setSpecial] = useState<SpecialKind | undefined>(() => initialSpecial(initialValue));
  const answer = useCallback(
    (n: number) => {
      setSpecial(undefined);
      onAnswer(buildValues([{ value: n }]));
    },
    [onAnswer],
  );
  const pickSpecial = (s: SpecialAnswer) => {
    setSpecial(s.kind);
    setValue(null);
    setText("");
    onAnswer(buildValues([specialValue(s)]));
  };

  const isInput = layout !== "buttons" && layout !== "slider";
  const values = layout === "buttons" ? buttonValues(variable) : [];
  // Up to nine buttons: number keys choose them
  const targets = values.length && values.length <= 9 ? [values.map((n) => ({ label: String(n) }))] : null;
  useKeyTargets(targets, (_, i) => answer(values[i]));
  const input = useRef<HTMLInputElement>(null);
  useTypeIntoInput(input, setText, isInput);
  const slider = { variable, value, setValue, onAnswer: answer };
  useSliderKeys(slider, layout === "slider");

  return (
    <div className="flex flex-col gap-1.5">
      {layout === "buttons" && <NumberButtons variable={variable} values={values} value={value} onAnswer={answer} />}
      {layout === "slider" && <NumberSlider {...slider} />}
      {isInput && <NumberInput variable={variable} input={input} text={text} setText={setText} onAnswer={answer} />}
      <SpecialAnswersRow specials={variable.specials} selected={special} onPick={pickSpecial} />
    </div>
  );
}
