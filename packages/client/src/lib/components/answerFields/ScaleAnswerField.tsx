import { useEffect, useRef, useState } from "react";
import { optionLabel, resolveLayout, type Option } from "@annotinder/contracts";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildValues } from "./answerValue";
import { CompactRow, EndLabels } from "./OptionButtons";
import type { AnswerFieldProps, QuestionVariable } from "./types";

type ScaleVariable = Extract<QuestionVariable, { type: "scale" }>;

const itemLabel = (item: { name: string; label?: string }) => item.label ?? item.name.replaceAll("_", " ");

/**
 * A battery: every item rated on the same options, `compact` (a row of
 * values per item) or `grid` (a table with the labels as column heads). The
 * form may scroll, so Continue checks the items: with one missing, it
 * scrolls to it and highlights it instead.
 */
export function ScaleAnswerField({ variable, onAnswer, initialValue }: AnswerFieldProps<ScaleVariable>) {
  const { layout } = resolveLayout(variable);
  const items = variable.items;
  const [selected, setSelected] = useState<Record<string, Option["value"]>>(() =>
    Object.fromEntries((initialValue?.values ?? []).filter((v) => v.item !== undefined).map((v) => [v.item!, v.value])),
  );
  const [missing, setMissing] = useState<string | null>(null);
  const rows = useRef<Record<string, HTMLElement | null>>({});

  const nAnswered = items.filter((item) => selected[item.name] !== undefined).length;
  const done = nAnswered === items.length;

  function select(item: string, option: Option) {
    setSelected((current) => ({ ...current, [item]: option.value }));
    if (missing === item) setMissing(null);
  }

  function submit() {
    const first = items.find((item) => selected[item.name] === undefined);
    if (first) {
      setMissing(first.name);
      rows.current[first.name]?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    onAnswer(buildValues(items.map((item) => ({ item: item.name, value: selected[item.name] }))));
  }

  // Number keys answer the first unanswered item; Enter continues.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === "Enter") {
        event.preventDefault();
        submit();
        return;
      }
      const index = Number.parseInt(event.key, 10) - 1;
      if (Number.isNaN(index) || index < 0 || index >= Math.min(variable.options.length, 9)) return;
      const target = items.find((item) => selected[item.name] === undefined);
      if (!target) return;
      event.preventDefault();
      select(target.name, variable.options[index]);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const highlight = (name: string) => (missing === name ? "rounded-md ring-2 ring-destructive ring-offset-2 ring-offset-background" : "");

  return (
    <div className="flex flex-col gap-2">
      {layout === "grid" ? (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-y-1 text-sm">
            <thead>
              <tr>
                <th />
                {variable.options.map((option) => (
                  <th key={String(option.value)} className="px-1 text-center text-xs font-normal text-muted-foreground">
                    {optionLabel(option)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.name} ref={(el) => void (rows.current[item.name] = el)} className={highlight(item.name)}>
                  <th scope="row" className="pr-2 text-left font-normal">
                    {itemLabel(item)}
                  </th>
                  {variable.options.map((option) => {
                    const checked = selected[item.name] === option.value;
                    return (
                      <td key={String(option.value)} className="text-center">
                        <input
                          type="radio"
                          className="size-5 cursor-pointer accent-primary"
                          name={`${item.name}`}
                          aria-label={`${itemLabel(item)}: ${optionLabel(option)}`}
                          checked={checked}
                          onChange={() => select(item.name, option)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <EndLabels options={variable.options} />
          <div className="flex flex-col gap-1.5">
            {items.map((item) => (
              <div key={item.name} ref={(el) => void (rows.current[item.name] = el)} className={`flex flex-col gap-0.5 ${highlight(item.name)}`}>
                <div className="text-center text-sm text-foreground">{itemLabel(item)}</div>
                <CompactRow options={variable.options} selected={selected[item.name]} onSelect={(o) => select(item.name, o)} label={itemLabel(item)} />
              </div>
            ))}
          </div>
        </>
      )}

      <Button
        type="button"
        className="h-10"
        variant={done ? "default" : "secondary"}
        onClick={submit}
        aria-label={done ? "Continue" : `${nAnswered} of ${items.length} answered`}
      >
        {done ? <Play className="size-4" /> : `${nAnswered} / ${items.length}`}
      </Button>
    </div>
  );
}
