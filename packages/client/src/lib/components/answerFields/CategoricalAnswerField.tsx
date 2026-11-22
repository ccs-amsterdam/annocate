import { useCallback, useMemo, useState } from "react";
import { useAnswerLayout } from "../../display/hooks";
import {
  SPECIAL_KEYS,
  optionLabel,
  ordinaryOptions,
  specialOptions,
  type Option,
  type OptionValue,
} from "@annotinder/contracts";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buildValues, initialValues } from "./answerValue";
import { CompactRow, EndLabels, OptionButton, SpecialOptionsRow } from "./OptionButtons";
import { optionsContainerStyle } from "./optionLayout";
import { useKeyTargets } from "../../keyboard/hooks";
import type { AnswerFieldProps, QuestionVariable } from "./types";

type CategoricalVariable = Extract<QuestionVariable, { type: "nominal" | "ordinal" }>;

/**
 * Nominal and ordinal questions: pick one (or with `multiple`, several) of
 * the options, laid out as the question says or as `auto` picks (contracts
 * `resolveLayout`). One answer is given on the first click; several are
 * confirmed with Continue.
 */
export function CategoricalAnswerField({ variable, onAnswer, initialValue }: AnswerFieldProps<CategoricalVariable>) {
  const multiple = variable.type === "nominal" && Boolean(variable.multiple);
  const resolved = useAnswerLayout(variable);
  const layout = "columns" in resolved ? resolved.layout : "grid";
  const columns = "columns" in resolved ? resolved.columns : 1;
  const [selected, setSelected] = useState<OptionValue[]>(() => initialValues(initialValue));
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  // Categories (or scale points) first, the special options after them, apart
  const ordinary = ordinaryOptions(variable.options);
  const specials = specialOptions(variable.options);
  const shown = [...ordinary, ...specials];

  const pick = useCallback(
    (option: Option) => {
      if (!multiple) {
        setSelected([option.value]);
        onAnswer(buildValues([{ value: option.value }]));
        return;
      }
      // Several answers: a special option is the only answer (it clears the others, and they clear it)
      const special = new Set<OptionValue>(variable.options.filter((o) => o.special).map((o) => o.value));
      setSelected((current) => {
        if (current.includes(option.value)) return current.filter((v) => v !== option.value);
        return option.special ? [option.value] : [...current.filter((v) => !special.has(v)), option.value];
      });
    },
    [multiple, onAnswer, variable.options],
  );

  const submit = () => {
    if (!selected.length) return;
    // In option order, not click order.
    const values = variable.options.map((o) => o.value).filter((v) => selectedSet.has(v));
    onAnswer(buildValues(values.map((value) => ({ value }))));
  };

  // Where each option is (row and column), for the numpad: rows and grids; flex wraps unpredictably
  const posOf = (i: number) =>
    layout === "row" || layout === "compact"
      ? { row: 0, col: i }
      : layout === "grid"
        ? { row: Math.floor(i / columns), col: i % columns }
        : undefined;
  // The options for the keyboard (a dropdown has its own filter box)
  const targets =
    layout === "dropdown"
      ? null
      : [
          shown.map((o, i) =>
            o.special
              ? { label: optionLabel(o), fixed: SPECIAL_KEYS[o.special] }
              : { label: optionLabel(o), pos: posOf(i) },
          ),
        ];
  const keyboard = useKeyTargets(targets, (_, index) => pick(shown[index]), {
    // Several answers: Enter continues (as the Continue button)
    onEnter: multiple ? submit : undefined,
    filterable: true,
  });
  const keys = keyboard.keys[0] ?? [];
  const dimmed = (index: number) => keyboard.filter !== "" && !keyboard.matches[0]?.[index];

  let field;
  if (layout === "dropdown") {
    field = <OptionsDropdown options={shown} selected={selectedSet} multiple={multiple} onPick={pick} />;
  } else if (layout === "compact") {
    field = (
      <div className="flex flex-col gap-1">
        <EndLabels options={ordinary} />
        <CompactRow options={ordinary} selected={selected[0]} onSelect={pick} />
        <SpecialOptionsRow
          options={specials}
          isSelected={(o) => selectedSet.has(o.value)}
          keys={keys.slice(ordinary.length)}
          onPick={pick}
        />
      </div>
    );
  } else {
    const container = optionsContainerStyle(layout, ordinary.length, columns);
    field = (
      <div className="flex flex-col gap-1.5">
        <div className={container.className} style={container.style}>
          {ordinary.map((option, index) => (
            <OptionButton
              key={String(option.value)}
              option={option}
              selected={selectedSet.has(option.value)}
              shortcut={keys[index]}
              dimmed={dimmed(index)}
              check={multiple}
              onClick={() => pick(option)}
            />
          ))}
        </div>
        <SpecialOptionsRow
          options={specials}
          isSelected={(o) => selectedSet.has(o.value)}
          keys={keys.slice(ordinary.length)}
          onPick={pick}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {keyboard.filter && (
        <p className="text-center text-xs text-muted-foreground" role="status">
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">{keyboard.filter}</span> Enter
          chooses the first match, Esc clears
        </p>
      )}
      {field}
      {multiple && (
        <Button type="button" className="h-10" disabled={!selected.length} onClick={submit}>
          Continue{selected.length ? ` (${selected.length})` : ""}
        </Button>
      )}
    </div>
  );
}

interface OptionsDropdownProps {
  options: Option[];
  selected: Set<OptionValue>;
  multiple: boolean;
  onPick: (option: Option) => void;
}

/** A combobox with a filter box, for long lists. */
function OptionsDropdown({ options, selected, multiple, onPick }: OptionsDropdownProps) {
  const [open, setOpen] = useState(false);
  const chosen = options.filter((o) => selected.has(o.value));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-10 w-full justify-between"
        >
          <span className="truncate">{chosen.length ? chosen.map(optionLabel).join(", ") : "Choose…"}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(32rem,calc(100vw-2rem))] p-0" align="start">
        <Command>
          <CommandInput placeholder="Type to filter…" />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={String(option.value)}
                  value={`${optionLabel(option)} ${option.value}`}
                  onSelect={() => {
                    if (!multiple) setOpen(false);
                    onPick(option);
                  }}
                >
                  <span className="flex flex-1 items-center gap-2 truncate">
                    {option.color && (
                      <span className="size-3 rounded-full border" style={{ backgroundColor: option.color }} />
                    )}
                    <span className="truncate">{optionLabel(option)}</span>
                  </span>
                  {selected.has(option.value) && <Check className="size-4" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
