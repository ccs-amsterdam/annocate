import type { RefObject } from "react";
import { numericValueError } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { NumericVariable } from "./numericKeys";

/** A number typed in (also open ranges), with what is wrong with it and the labels of break points as hints. */
export function NumberInput({
  variable,
  input,
  text,
  setText,
  onAnswer,
}: {
  variable: NumericVariable;
  input: RefObject<HTMLInputElement | null>;
  /** What is typed so far. */
  text: string;
  setText: (text: string) => void;
  onAnswer: (n: number) => void;
}) {
  const labels = variable.labels ?? [];
  const parsed = text.trim() === "" ? null : Number(text);
  const error = parsed === null ? null : numericValueError(variable, parsed);
  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (parsed !== null && !error) onAnswer(parsed);
      }}
    >
      <div className="flex gap-2">
        <Input
          ref={input}
          type="number"
          inputMode="decimal"
          className="h-10"
          min={variable.min}
          max={variable.max}
          step={variable.step ?? 1}
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
