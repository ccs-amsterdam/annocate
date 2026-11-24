import { COMMAND_BADGES } from "../../keyboard/commands";
import { useRef, useState } from "react";
import { useAnswerLayout } from "../../display/hooks";
import { optionLabel, specialLabel, type Option, type SpecialAnswer, type ValueAnswer } from "@annotinder/contracts";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildValues, specialValue } from "./answerValue";
import { ScaleCompactRows } from "./ScaleCompactRows";
import { ScaleGrid } from "./ScaleGrid";
import type { ScaleRowsProps, ScaleVariable } from "./scaleRows";
import type { AnswerFieldProps } from "./types";
import { useKeyTargets, useSpecialKeys } from "../../keyboard/hooks";
import { ShortcutBadge } from "../ShortcutBadge";

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

  const rowsProps: ScaleRowsProps = {
    items,
    points,
    specials,
    selected,
    onSelect: select,
    onSelectSpecial: selectSpecial,
    active,
    rowRef: (name) => (el) => void (rows.current[name] = el),
    highlight: (name) =>
      missing === name ? "rounded-md ring-2 ring-destructive ring-offset-2 ring-offset-background" : "",
  };

  return (
    <div className="flex flex-col gap-2">
      {layout === "grid" ? (
        <ScaleGrid {...rowsProps} specialBadges={specialBadges} />
      ) : (
        <ScaleCompactRows {...rowsProps} />
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
