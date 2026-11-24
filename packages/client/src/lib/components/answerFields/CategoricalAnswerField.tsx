import { COMMAND_BADGES } from "../../keyboard/commands";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAnswerLayout } from "../../display/hooks";
import {
  optionLabel,
  type Option,
  type OptionValue,
  type SpecialAnswer,
  type SpecialKind,
} from "@annotinder/contracts";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { buildValues, initialSpecial, initialValues, specialValue } from "./answerValue";
import { CompactRow, EndLabels, OptionButton, SpecialAnswersRow } from "./OptionButtons";
import { optionsContainerStyle } from "./optionLayout";
import { useKeyScope, useKeyTargets } from "../../keyboard/hooks";
import { ShortcutBadge } from "../ShortcutBadge";
import { PRIORITY } from "../../keyboard/controller";
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
  // A special answer (don't know, not applicable): the only answer
  const [special, setSpecial] = useState<SpecialKind | undefined>(() => initialSpecial(initialValue));
  const options = variable.options;

  const pick = useCallback(
    (option: Option) => {
      setSpecial(undefined);
      if (!multiple) {
        setSelected([option.value]);
        onAnswer(buildValues([{ value: option.value }]));
        return;
      }
      setSelected((current) =>
        current.includes(option.value) ? current.filter((v) => v !== option.value) : [...current, option.value],
      );
    },
    [multiple, onAnswer],
  );

  const pickSpecial = (s: SpecialAnswer) => {
    setSelected([]);
    setSpecial(s.kind);
    onAnswer(buildValues([specialValue(s)]));
  };

  const submit = () => {
    if (special) {
      const s = variable.specials?.find((x) => x.kind === special);
      if (s) onAnswer(buildValues([specialValue(s)]));
      return;
    }
    if (!selected.length) return;
    // In option order, not click order.
    const values = options.map((o) => o.value).filter((v) => selectedSet.has(v));
    onAnswer(buildValues(values.map((value) => ({ value }))));
  };
  const chosen = special ? 1 : selected.length;

  // Where each option is (row and column), for the numpad: rows and grids; flex wraps unpredictably
  const posOf = (i: number) =>
    layout === "row" || layout === "compact"
      ? { row: 0, col: i }
      : layout === "grid"
        ? { row: Math.floor(i / columns), col: i % columns }
        : undefined;
  // The options for the keyboard (a dropdown has its own filter box)
  const targets = layout === "dropdown" ? null : [options.map((o, i) => ({ label: optionLabel(o), pos: posOf(i) }))];
  const keyboard = useKeyTargets(targets, (_, index) => pick(options[index]), {
    // Several answers: Ctrl + Enter continues (as the Continue button)
    onEnter: multiple ? submit : undefined,
    filterable: true,
  });
  const keys = keyboard.keys[0] ?? [];
  const dimmed = (index: number) => keyboard.filter !== "" && !keyboard.matches[0]?.[index];

  let field;
  if (layout === "dropdown") {
    field = <OptionsDropdown options={options} selected={selectedSet} multiple={multiple} onPick={pick} />;
  } else if (layout === "compact") {
    field = (
      <div className="flex flex-col gap-1">
        <EndLabels options={options} />
        <CompactRow options={options} selected={selected[0]} onSelect={pick} />
      </div>
    );
  } else {
    const container = optionsContainerStyle(layout, options.length, columns);
    field = (
      <div className={container.className} style={container.style}>
        {options.map((option, index) => (
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
      <div className="flex flex-col gap-1.5">
        {field}
        <SpecialAnswersRow specials={variable.specials} selected={special} onPick={pickSpecial} />
      </div>
      {multiple && (
        // The arrows reach it too, below the options
        <Button type="button" className="relative h-10" data-key-target="" disabled={!chosen} onClick={submit}>
          Continue{chosen ? ` (${chosen})` : ""}
          <ShortcutBadge shortcut={COMMAND_BADGES.continue} />
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

/**
 * A combobox with a filter box, for long lists. The keyboard opens it: the
 * arrows (then browse with them), or typing (which starts the filter).
 */
function OptionsDropdown({ options, selected, multiple, onPick }: OptionsDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  const chosen = options.filter((o) => selected.has(o.value));
  useKeyScope(
    (press) => {
      if (press.altKey || press.ctrlKey || press.metaKey || press.shiftKey) return false;
      if (press.key === "ArrowDown" || press.key === "ArrowUp") {
        setSearch("");
        setOpen(true);
        return true;
      }
      if (press.key.length === 1 && press.key !== " ") {
        setSearch(press.key);
        setOpen(true);
        return true;
      }
      return false;
    },
    !open,
    { priority: PRIORITY.field },
  );
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
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
      <PopoverContent
        className="w-[min(32rem,calc(100vw-2rem))] p-0"
        align="start"
        // Reopened (the keys) before the last close is done: that close doesn't take the focus back to the button
        onCloseAutoFocus={(e) => {
          if (openRef.current) e.preventDefault();
        }}
      >
        <Command>
          <CommandInput
            ref={input}
            placeholder="Type to filter…"
            value={search}
            onValueChange={setSearch}
            // Opened by typing: the cursor after that letter, so the next one adds to it
            onFocus={(e) => {
              const input = e.currentTarget;
              requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
            }}
          />
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
