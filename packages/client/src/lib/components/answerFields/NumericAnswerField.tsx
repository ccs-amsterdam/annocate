import { useCallback, useState } from "react";
import { numericSteps, numericValueError, resolveLayout } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildValues, initialValues } from "./answerValue";
import { useNumberShortcuts } from "./OptionButtons";
import type { AnswerFieldProps, QuestionVariable } from "./types";

type NumericVariable = Extract<QuestionVariable, { type: "numeric" }>;

/** The number of decimals a step needs (0.1 -> 1). */
function decimals(step: number): number {
  const text = String(step);
  return text.includes(".") ? text.split(".")[1].length : 0;
}

/**
 * One number: `buttons` (one per value, for small ranges), `slider` (a
 * closed range) or `input` (also open ranges). Labels at break points are
 * shown under the buttons or slider, and as hints next to an input.
 */
export function NumericAnswerField({ variable, onAnswer, initialValue }: AnswerFieldProps<NumericVariable>) {
  const { layout } = resolveLayout(variable);
  const step = variable.step ?? 1;
  const initial = initialValues(initialValue)[0];
  const [value, setValue] = useState<number | null>(typeof initial === "number" ? initial : null);
  const [text, setText] = useState(typeof initial === "number" ? String(initial) : "");

  const answer = useCallback((n: number) => onAnswer(buildValues([{ value: n }])), [onAnswer]);

  const values =
    layout === "buttons"
      ? Array.from({ length: numericSteps(variable) ?? 0 }, (_, i) => Number(((variable.min ?? 0) + i * step).toFixed(decimals(step))))
      : [];
  useNumberShortcuts(values.length, values.length && values.length <= 9 ? (i) => answer(values[i]) : null);

  const labels = variable.labels ?? [];

  if (layout === "buttons") {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap gap-1 [&>*]:grow [&>*]:basis-8">
          {values.map((n) => (
            <Button key={n} type="button" variant={value === n ? "default" : "outline"} className="h-10 min-w-0 px-1" onClick={() => answer(n)}>
              {n}
            </Button>
          ))}
        </div>
        <ScaleLabels labels={labels} min={variable.min!} max={variable.max!} />
      </div>
    );
  }

  if (layout === "slider") {
    const current = value ?? (variable.min! + variable.max!) / 2;
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <input
            type="range"
            className="h-10 flex-1 cursor-pointer accent-primary"
            min={variable.min}
            max={variable.max}
            step={step}
            value={current}
            aria-label="Value"
            onChange={(e) => setValue(Number(e.target.value))}
          />
          <span className={`w-12 text-right font-mono text-sm ${value === null ? "text-muted-foreground" : ""}`}>{value ?? "–"}</span>
        </div>
        <ScaleLabels labels={labels} min={variable.min!} max={variable.max!} />
        <Button type="button" className="h-10" disabled={value === null} onClick={() => value !== null && answer(value)}>
          Continue
        </Button>
      </div>
    );
  }

  const parsed = text.trim() === "" ? null : Number(text);
  const error = parsed === null ? null : numericValueError(variable, parsed);
  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (parsed !== null && !error) answer(parsed);
      }}
    >
      <div className="flex gap-2">
        <Input
          type="number"
          inputMode="decimal"
          className="h-10"
          min={variable.min}
          max={variable.max}
          step={step}
          value={text}
          aria-invalid={Boolean(error)}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" className="h-10" disabled={parsed === null || Boolean(error)}>
          Continue
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">This is {error}</p>}
      {labels.length > 0 && (
        <p className="text-xs text-muted-foreground">{labels.map((l) => `${l.value}: ${l.label}`).join(" · ")}</p>
      )}
    </form>
  );
}

/** Break-point labels at their positions under buttons or a slider. */
function ScaleLabels({ labels, min, max }: { labels: { value: number; label: string }[]; min: number; max: number }) {
  if (!labels.length) return null;
  return (
    <div className="relative h-4 text-xs text-muted-foreground">
      {labels.map((l) => {
        const pct = ((l.value - min) / (max - min)) * 100;
        const align = pct < 15 ? "translate-x-0" : pct > 85 ? "-translate-x-full" : "-translate-x-1/2";
        return (
          <span key={l.value} className={`absolute whitespace-nowrap ${align}`} style={{ left: `${pct}%` }}>
            {l.label}
          </span>
        );
      })}
    </div>
  );
}
