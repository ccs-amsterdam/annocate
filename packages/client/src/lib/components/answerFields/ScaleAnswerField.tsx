import { useRef, useState } from "react";
import {
  SPECIAL_KEYS,
  optionLabel,
  ordinaryOptions,
  resolveLayout,
  specialOptions,
  type Option,
} from "@annotinder/contracts";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildValues } from "./answerValue";
import { CompactRow, EndLabels, SpecialButton } from "./OptionButtons";
import type { AnswerFieldProps, QuestionVariable } from "./types";
import { useKeyTargets } from "../../keyboard/hooks";

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
  // The scale's points, then its special options (don't know, not applicable), apart
  const points = ordinaryOptions(variable.options);
  const specials = specialOptions(variable.options);
  const columns = [...points, ...specials];
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

  // The keyboard answers the first unanswered item; Enter continues.
  const keyed = columns.map((o) => ({
    label: optionLabel(o),
    ...(o.special ? { fixed: SPECIAL_KEYS[o.special] } : {}),
  }));
  const targets = items.map(() => keyed);
  useKeyTargets(targets, (item, index) => select(items[item].name, columns[index]), {
    activeGroup: items.findIndex((item) => selected[item.name] === undefined),
    onEnter: submit,
  });

  const highlight = (name: string) =>
    missing === name ? "rounded-md ring-2 ring-destructive ring-offset-2 ring-offset-background" : "";

  return (
    <div className="flex flex-col gap-2">
      {layout === "grid" ? (
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-y-1 text-sm">
            <thead>
              <tr>
                <th />
                {columns.map((option, i) => (
                  <th
                    key={String(option.value)}
                    className={`px-1 text-center text-xs font-normal text-muted-foreground ${i === points.length ? "border-l border-dashed border-border" : ""}`}
                  >
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
                  {columns.map((option, i) => {
                    const checked = selected[item.name] === option.value;
                    return (
                      <td
                        key={String(option.value)}
                        className={`text-center ${i === points.length ? "border-l border-dashed border-border" : ""}`}
                      >
                        <input
                          type="radio"
                          className="size-5 cursor-pointer accent-primary"
                          name={`${item.name}`}
                          aria-label={`${itemLabel(item)}: ${optionLabel(option)}`}
                          checked={checked}
                          data-key-target=""
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
          <EndLabels options={points} />
          <div className="flex flex-col gap-1.5">
            {items.map((item) => (
              <div
                key={item.name}
                ref={(el) => void (rows.current[item.name] = el)}
                className={`flex flex-col gap-0.5 ${highlight(item.name)}`}
              >
                <div className="text-center text-sm text-foreground">{itemLabel(item)}</div>
                <div className="flex items-center gap-1.5">
                  <CompactRow
                    options={points}
                    selected={selected[item.name]}
                    onSelect={(o) => select(item.name, o)}
                    label={itemLabel(item)}
                  />
                  {specials.map((option) => (
                    <SpecialButton
                      key={String(option.value)}
                      option={option}
                      selected={selected[item.name] === option.value}
                      onClick={() => select(item.name, option)}
                    />
                  ))}
                </div>
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
