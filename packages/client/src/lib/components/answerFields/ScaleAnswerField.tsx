import { COMMAND_BADGES } from "../../keyboard/commands";
import { useRef, useState } from "react";
import { useAnswerLayout } from "../../display/hooks";
import { optionLabel, specialLabel, type Option, type SpecialAnswer, type ValueAnswer } from "@annotinder/contracts";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildValues, specialValue } from "./answerValue";
import { CompactRow, EndLabels, SpecialAnswersRow } from "./OptionButtons";
import type { AnswerFieldProps, QuestionVariable } from "./types";
import { useKeyTargets, useSpecialKeys } from "../../keyboard/hooks";
import { ShortcutBadge } from "../ShortcutBadge";

type ScaleVariable = Extract<QuestionVariable, { type: "scale" }>;

const itemLabel = (item: { name: string; label?: string }) => item.label ?? item.name.replaceAll("_", " ");

/**
 * A battery: every item rated on the same options, `compact` (a row of
 * values per item) or `grid` (a table with the labels as column heads). The
 * form may scroll, so Continue checks the items: with one missing, it
 * scrolls to it and highlights it instead.
 */
export function ScaleAnswerField({ variable, onAnswer, initialValue }: AnswerFieldProps<ScaleVariable>) {
  const { layout } = useAnswerLayout(variable);
  const items = variable.items;
  // The scale's points; its special answers (don't know, not applicable) apart, for each item
  const points = variable.options;
  const specials = variable.specials ?? [];
  const [selected, setSelected] = useState<Record<string, ValueAnswer>>(() =>
    Object.fromEntries((initialValue?.values ?? []).filter((v) => v.item !== undefined).map((v) => [v.item!, v])),
  );
  const [missing, setMissing] = useState<string | null>(null);
  const rows = useRef<Record<string, HTMLElement | null>>({});

  const nAnswered = items.filter((item) => selected[item.name] !== undefined).length;
  const done = nAnswered === items.length;

  function select(item: string, option: Option) {
    setSelected((current) => ({ ...current, [item]: { item, value: option.value } }));
    if (missing === item) setMissing(null);
  }
  function selectSpecial(item: string, special: SpecialAnswer) {
    setSelected((current) => ({ ...current, [item]: specialValue(special, item) }));
    if (missing === item) setMissing(null);
  }
  const isPoint = (item: string, option: Option) => !selected[item]?.special && selected[item]?.value === option.value;

  function submit() {
    const first = items.find((item) => selected[item.name] === undefined);
    if (first) {
      setMissing(first.name);
      rows.current[first.name]?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    onAnswer(buildValues(items.map((item) => ({ ...selected[item.name], item: item.name }))));
  }

  // The keyboard answers the first unanswered item (/ 8, / 9: its special answers); Ctrl + Enter continues.
  const keyed = points.map((o) => ({ label: optionLabel(o) }));
  const targets = items.map(() => keyed);
  const active = items.findIndex((item) => selected[item.name] === undefined);
  useKeyTargets(targets, (item, index) => select(items[item].name, points[index]), {
    activeGroup: active,
    onEnter: submit,
  });
  // The grid's special columns (a compact row has its own)
  const specialBadges = useSpecialKeys(
    specials.map((s) => ({ kind: s.kind, label: specialLabel(s) })),
    (kind) =>
      selectSpecial(
        items[active].name,
        specials.find((s) => s.kind === kind)!,
      ),
    layout === "grid" && active >= 0,
  );

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
                {points.map((option) => (
                  <th key={String(option.value)} className="px-1 text-center text-xs font-normal text-muted-foreground">
                    {optionLabel(option)}
                  </th>
                ))}
                {specials.map((special, i) => (
                  <th
                    key={special.kind}
                    className={`px-1 text-center text-xs font-normal text-muted-foreground ${i === 0 ? "border-l border-dashed border-border" : ""}`}
                  >
                    {specialLabel(special)}
                    {specialBadges[i] && (
                      <span className="ml-1 rounded border px-1 font-mono text-[10px]">{specialBadges[i]}</span>
                    )}
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
                  {points.map((option) => (
                    <td key={String(option.value)} className="text-center">
                      <input
                        type="radio"
                        className="size-5 cursor-pointer accent-primary"
                        name={`${item.name}`}
                        aria-label={`${itemLabel(item)}: ${optionLabel(option)}`}
                        checked={isPoint(item.name, option)}
                        data-key-target=""
                        onChange={() => select(item.name, option)}
                      />
                    </td>
                  ))}
                  {specials.map((special, i) => (
                    <td
                      key={special.kind}
                      className={`text-center ${i === 0 ? "border-l border-dashed border-border" : ""}`}
                    >
                      <input
                        type="radio"
                        className="size-5 cursor-pointer accent-primary"
                        name={`${item.name}`}
                        aria-label={`${itemLabel(item)}: ${specialLabel(special)}`}
                        checked={selected[item.name]?.special === special.kind}
                        data-key-target=""
                        data-special={special.kind}
                        onChange={() => selectSpecial(item.name, special)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <EndLabels options={points} />
          <div className="flex flex-col gap-1.5">
            {items.map((item, i) => (
              <div
                key={item.name}
                ref={(el) => void (rows.current[item.name] = el)}
                className={`flex flex-col gap-0.5 ${highlight(item.name)}`}
              >
                <div className="text-center text-sm text-foreground">{itemLabel(item)}</div>
                <div className="flex items-center gap-1.5">
                  <CompactRow
                    options={points}
                    selected={selected[item.name]?.special ? undefined : selected[item.name]?.value}
                    onSelect={(o) => select(item.name, o)}
                    label={itemLabel(item)}
                  />
                  <SpecialAnswersRow
                    specials={specials}
                    selected={selected[item.name]?.special}
                    onPick={(special) => selectSpecial(item.name, special)}
                    keys={i === active}
                    className="flex shrink-0 gap-1"
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <Button
        type="button"
        className="relative h-10"
        variant={done ? "default" : "secondary"}
        // The arrows reach it too, below the items
        data-key-target=""
        onClick={submit}
        aria-label={done ? "Continue" : `${nAnswered} of ${items.length} answered`}
      >
        {done ? <Play className="size-4" /> : `${nAnswered} / ${items.length}`}
        {/* Ctrl + Enter continues once every item is answered */}
        {done && <ShortcutBadge shortcut={COMMAND_BADGES.continue} />}
      </Button>
    </div>
  );
}
